#Requires -Version 7.2
<#
.SYNOPSIS
  Compares the students who need a Microsoft 365 account (Year 3 and up)
  with Microsoft 365 and reports every difference.

.DESCRIPTION
  Dry run by default: reads data/students.json (from fetch-students.sh) and
  Microsoft 365 with read-only permissions, shows every change the Microsoft
  side needs, and writes two owner-only CSV reports to reports/:
    students-<stamp>.csv         one row per student / account
    team-changes-<stamp>.csv     proposed Team changes, for review
    sign-in-blocks-<stamp>.csv   accounts whose sign-in could be blocked, for review
  Nothing is changed. See README.md.

  -Apply makes the account changes only (create, link, update, licence).
  It never changes Team membership, usernames or email addresses.

  New accounts get the password in M365_STUDENT_INITIAL_PASSWORD (.env) if
  set, otherwise a random one each; either way it must be changed at first
  sign-in.

.PARAMETER Apply
  Make the planned account changes. New accounts' initial passwords are
  saved to reports/new-accounts-<stamp>.csv (owner-only).

.PARAMETER ApplyTeamChanges
  A reviewed reports/team-changes-<stamp>.csv. Applies only rows with
  Approved = yes that are still needed now; makes no account changes.
  Deletes the student data file afterwards unless -KeepData.

.PARAMETER ApplySignInBlocks
  A reviewed reports/sign-in-blocks-<stamp>.csv. Blocks sign-in (and does
  nothing else) for rows with Approved = yes that are still proposed now.

.PARAMETER Force
  Proceed even if Team removals exceed MaxTeamRemovalPercent.

.PARAMETER KeepData
  Don't delete data/students.json after a successful -ApplyTeamChanges.

.PARAMETER DataPath
  Student data written by fetch-students.sh.

.PARAMETER Only
  Plan for one student, by student code.

.PARAMETER Device
  Sign in with a device code instead of a browser window.

.PARAMETER ShowEmails
  Show full usernames on screen. They are never written to the log file.

.EXAMPLE
  ./fetch-students.sh
  pwsh ./sync-students.ps1
  pwsh ./sync-students.ps1 -Apply
  pwsh ./sync-students.ps1 -ApplyTeamChanges reports/team-changes-20260929-101500.csv
#>
[CmdletBinding()]
param(
    [switch]$Apply,
    [string]$ApplyTeamChanges,
    [string]$ApplySignInBlocks,
    [switch]$Force,
    [switch]$KeepData,
    [string]$Only,
    [switch]$Device,
    [switch]$ShowEmails,
    [string]$DataPath = (Join-Path $PSScriptRoot 'data/students.json'),
    [string]$ReportDirectory = (Join-Path $PSScriptRoot 'reports'),
    [string]$LogDirectory = (Join-Path $PSScriptRoot 'logs'),
    [string]$EnvPath = (Join-Path $PSScriptRoot '.env'),
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.psd1')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot '../m365-sync/lib/Common.ps1')
. (Join-Path $PSScriptRoot 'lib/StudentConfig.ps1')
. (Join-Path $PSScriptRoot 'lib/StudentData.ps1')
. (Join-Path $PSScriptRoot 'lib/Graph.ps1')
. (Join-Path $PSScriptRoot 'lib/StudentPlan.ps1')
. (Join-Path $PSScriptRoot 'lib/TeamChanges.ps1')
. (Join-Path $PSScriptRoot 'lib/Apply.ps1')
. (Join-Path $PSScriptRoot 'lib/SignInBlocks.ps1')
. (Join-Path $PSScriptRoot 'lib/Reports.ps1')

# Issues that need someone to fix data before the sync is complete.
$script:BlockingIssues = @('NO CODE', 'UNKNOWN YEAR GROUP')

function Format-Upn {
    [OutputType([string])]
    param([AllowNull()][AllowEmptyString()][string]$Upn)
    if (-not $Upn) { return '-' }
    if ($ShowEmails) { return $Upn }
    return Protect-Email $Upn
}

function Format-Changes {
    [OutputType([string])]
    param([System.Collections.IDictionary]$Changes)
    return (@($Changes.Keys | ForEach-Object { "$_ '$($Changes[$_].From)' -> '$($Changes[$_].To)'" }) -join '; ')
}

function Write-PlanDetails {
    [OutputType([void])]
    param([Parameter(Mandatory)][hashtable]$Plan)

    Write-Host ''
    if ($ShowEmails) {
        Write-Host '*** DETAILED PLAN BELOW CONTAINS FULL USERNAMES (personal data). Do not copy or share it. ***' -ForegroundColor Magenta
    }
    else {
        Write-Host 'Detailed plan (names shown on screen only; usernames masked - use -ShowEmails to see them in full):' -ForegroundColor Cyan
    }

    foreach ($i in $Plan.Creates) {
        Write-SyncLog "PLAN CREATE  [$($i.Code)] $(Protect-Email $i.Upn)" `
            -ConsoleMessage "  + CREATE   $($i.DisplayName) [$($i.Code)] <$(Format-Upn $i.Upn)>"
    }
    foreach ($i in $Plan.Links) {
        Write-SyncLog "PLAN LINK    [$($i.Code)] $(Protect-Email $i.Upn) fields: $(@($i.Changes.Keys) -join ', ')" `
            -ConsoleMessage "  = LINK     $($i.DisplayName) [$($i.Code)] <$(Format-Upn $i.Upn)> (existing account, matched by name): $(Format-Changes $i.Changes)"
    }
    foreach ($i in $Plan.Updates) {
        Write-SyncLog "PLAN UPDATE  [$($i.Code)] $(Protect-Email $i.Upn) fields: $(@($i.Changes.Keys) -join ', ')" `
            -ConsoleMessage "  ~ UPDATE   $($i.DisplayName) [$($i.Code)] <$(Format-Upn $i.Upn)>: $(Format-Changes $i.Changes)"
    }
    foreach ($i in $Plan.Licenses) {
        Write-SyncLog "PLAN LICENCE [$($i.Code)] $(Protect-Email $i.Upn)" `
            -ConsoleMessage "  $ LICENCE  $($i.DisplayName) [$($i.Code)] <$(Format-Upn $i.Upn)>"
    }
    foreach ($i in $Plan.TeamChanges) {
        $arrow = if ($i.Action -eq 'ADD') { '>' } else { '<' }
        Write-SyncLog "PLAN TEAM $($i.Action) [$($i.StudentCode)] $($i.TeamNickname) ($($i.ChangeId))" `
            -ConsoleMessage "  $arrow TEAM $($i.Action.PadRight(6)) $($i.StudentName) [$($i.StudentCode)] $(if ($i.Action -eq 'ADD') { 'to' } else { 'from' }) $($i.Team) - $($i.Reason) (needs review)"
    }
    foreach ($i in $Plan.Issues) {
        $who = @($i.Name, $(if ($i.Code) { "[$($i.Code)]" }), $(if ($i.Upn) { "<$(Format-Upn $i.Upn)>" })) | Where-Object { $_ }
        $logWho = @($(if ($i.Code) { "[$($i.Code)]" }), $(if ($i.Upn) { Protect-Email $i.Upn })) | Where-Object { $_ }
        Write-SyncLog -Level WARN "ISSUE $($i.Type) $($logWho -join ' ')" `
            -ConsoleMessage "  ! $($i.Type): $(if ($who) { ($who -join ' ') + ': ' })$($i.Detail)"
    }
    Write-Host ''
}

function Write-CountSummary {
    [OutputType([void])]
    param(
        [Parameter(Mandatory)][hashtable]$Desired,
        [Parameter(Mandatory)][hashtable]$Plan
    )

    $c = $Desired.Counts
    Write-SyncLog '--- Summary (counts only) ---'
    Write-SyncLog "Academic year:                $($Desired.AcademicYear.Code)"
    Write-SyncLog "Active students:              $($c.Active)"
    Write-SyncLog "  need an account (Year 3+):  $($c.Eligible)"
    Write-SyncLog "  below Year 3 (no account):  $($c.NotEligible)"
    foreach ($group in ($Desired.Students.Values | Group-Object YearGroupLabel | Sort-Object Name)) {
        Write-SyncLog "    $($group.Name): $($group.Count)"
    }
    foreach ($s in $Desired.Skipped) { Write-SyncLog -Level WARN "Skipped in the database ($($s.reason)): $($s.count)" }
    Write-SyncLog "Accounts to create:           $($Plan.Creates.Count)"
    Write-SyncLog "Existing accounts to link:    $($Plan.Links.Count)"
    Write-SyncLog "Accounts to update:           $($Plan.Updates.Count)"
    Write-SyncLog "Licences to assign:           $($Plan.Licenses.Count)"
    Write-SyncLog "Team changes for review:      $(@($Plan.TeamChanges | Where-Object Action -eq 'ADD').Count) add, $(@($Plan.TeamChanges | Where-Object Action -eq 'REMOVE').Count) remove"
    Write-SyncLog ("  removals: {0:N1}% of {1} managed Team memberships (limit {2}%)" -f $Plan.TeamRemovalPercent, $Plan.ManagedMembershipCount, $Config.MaxTeamRemovalPercent)
    Write-SyncLog "Sign-in blocks for review:    $($Plan.SignInBlocks.Count) (enabled accounts reported below)"
    foreach ($group in ($Plan.Issues | Group-Object Type | Sort-Object Name)) {
        Write-SyncLog -Level WARN "Report only - $($group.Name): $($group.Count)"
    }
}

function Invoke-ApprovedSignInBlockStep {
    <# -ApplySignInBlocks: block sign-in for approved rows still proposed. Returns the exit code. #>
    [OutputType([int])]
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][hashtable]$Plan,
        [double]$MaxAgeHours
    )

    $rows = Read-ReviewFile -Path $Path -RequiredColumns @('ChangeId', 'Action', 'Upn', 'UserId') -MaxAgeHours $MaxAgeHours
    $selection = Select-ApprovedSignInBlocks -Rows $rows -SignInBlocks $Plan.SignInBlocks

    Write-Host ''
    foreach ($s in $selection.Skipped) {
        Write-SyncLog -Level WARN "SKIPPED block $(Protect-Email $s.Row.Upn): $($s.Reason)" `
            -ConsoleMessage "  - SKIPPED  $($s.Row.AccountName) <$(Format-Upn $s.Row.Upn)>: $($s.Reason)"
    }
    foreach ($b in $selection.ToApply) {
        Write-Host "  x BLOCK SIGN-IN  $($b.AccountName) <$(Format-Upn $b.Upn)>: $($b.Reason)"
    }
    Write-SyncLog "Rows in file: $($rows.Count)  approved and still proposed: $($selection.ToApply.Count)  skipped: $($selection.Skipped.Count)  not approved: $($selection.NotApproved)"
    if ($selection.ToApply.Count -eq 0) {
        Write-SyncLog 'No approved sign-in blocks to make.'
        return 0
    }

    $result = Invoke-SignInBlocks -Blocks $selection.ToApply
    Write-SyncLog '--- Applied (counts only) ---'
    Write-SyncLog "Sign-in blocked: $($result.Blocked)  failed: $($result.Failed)"
    if ($result.Failed -gt 0) {
        Write-SyncLog -Level WARN 'Some blocks failed (see errors above). Re-running with the same file is safe: done rows are skipped.'
        return 3
    }
    Write-SyncLog 'Done. To undo, unblock sign-in for the account in the Microsoft 365 admin centre.'
    return 0
}

function Invoke-ApprovedTeamChangeStep {
    <# -ApplyTeamChanges: apply approved rows still in the current plan. Returns the exit code. #>
    [OutputType([int])]
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][hashtable]$Plan,
        [double]$MaxAgeHours
    )

    $rows = Read-TeamChangeFile -Path $Path -MaxAgeHours $MaxAgeHours
    $selection = Select-ApprovedTeamChanges -Rows $rows -TeamChanges $Plan.TeamChanges

    Write-Host ''
    foreach ($s in $selection.Skipped) {
        Write-SyncLog -Level WARN "SKIPPED team $($s.Row.Action) [$($s.Row.StudentCode)] $($s.Row.TeamNickname): $($s.Reason)" `
            -ConsoleMessage "  - SKIPPED  $($s.Row.Action) $($s.Row.StudentName) [$($s.Row.StudentCode)] $($s.Row.Team): $($s.Reason)"
    }
    foreach ($c in $selection.ToApply) {
        Write-Host "  $(if ($c.Action -eq 'ADD') { '>' } else { '<' }) $($c.Action.PadRight(6)) $($c.StudentName) [$($c.StudentCode)] $(if ($c.Action -eq 'ADD') { 'to' } else { 'from' }) $($c.Team)"
    }
    Write-SyncLog "Rows in file: $($rows.Count)  approved and still needed: $($selection.ToApply.Count)  skipped: $($selection.Skipped.Count)  not approved: $($selection.NotApproved)"

    $removals = @($selection.ToApply | Where-Object Action -eq 'REMOVE').Count
    $percent = if ($Plan.ManagedMembershipCount -gt 0) { 100.0 * $removals / $Plan.ManagedMembershipCount } else { 0 }
    if ($percent -gt [double]$Config.MaxTeamRemovalPercent -and -not $Force) {
        Write-SyncLog -Level ERROR ("ABORTED: approved removals are {0:N1}% of managed Team memberships (limit {1}%). Re-run with -Force if this is expected." -f $percent, $Config.MaxTeamRemovalPercent)
        return 2
    }
    if ($selection.ToApply.Count -eq 0) {
        Write-SyncLog 'No approved Team changes to make.'
        return 0
    }

    $result = Invoke-TeamChanges -Changes $selection.ToApply
    Write-SyncLog '--- Applied (counts only) ---'
    Write-SyncLog "Team members added: $($result.Added)  removed: $($result.Removed)  failed: $($result.Failed)"
    if ($result.Failed -gt 0) {
        Write-SyncLog -Level WARN 'Some Team changes failed (see errors above). Re-running with the same file is safe: done rows are skipped.'
        return 3
    }
    if (-not $KeepData) {
        Remove-Item -LiteralPath $DataPath -Force
        Write-SyncLog 'Deleted the local student data file.'
    }
    Write-SyncLog 'Done. Teams can take a few minutes to show membership changes.'
    return 0
}

$Config = Import-StudentConfig -Path $ConfigPath -ContactSyncConfigPath (Join-Path $PSScriptRoot '../m365-sync/config.psd1')
Import-DotEnv -Path $EnvPath
$retention = if ($Config.ContainsKey('LogRetentionDays')) { [int]$Config.LogRetentionDays } else { 30 }
$logPath = Start-SyncLog -Directory $LogDirectory -Prefix 'sync-students' -RetentionDays $retention
if (@($Apply.IsPresent, [bool]$ApplyTeamChanges, [bool]$ApplySignInBlocks | Where-Object { $_ }).Count -gt 1) {
    Write-SyncLog -Level ERROR 'Use only one of -Apply (accounts), -ApplyTeamChanges (Teams) or -ApplySignInBlocks.'; exit 1
}
if ($Only -and ($ApplyTeamChanges -or $ApplySignInBlocks)) { Write-SyncLog -Level ERROR '-Only cannot be combined with -ApplyTeamChanges or -ApplySignInBlocks.'; exit 1 }
$write = $Apply -or [bool]$ApplyTeamChanges -or [bool]$ApplySignInBlocks
$mode = if ($Apply) { 'APPLY (accounts only)' } elseif ($ApplyTeamChanges) { 'APPLY APPROVED TEAM CHANGES' } elseif ($ApplySignInBlocks) { 'APPLY APPROVED SIGN-IN BLOCKS' } else { 'DRY RUN' }
Write-SyncLog "Mode: $mode. Log: $logPath"
if ($Only) { Write-SyncLog "Only student: $Only" }

try {
    # 1. Load the data written by fetch-students.sh.
    $maxAge = if ($Config.ContainsKey('MaxDataAgeHours')) { [double]$Config.MaxDataAgeHours } else { 24 }
    $desired = ConvertTo-DesiredStudentState -Data (Read-StudentDataFile -Path $DataPath) -Config $Config -MaxAgeHours $maxAge
    if ($Only -and -not $desired.Students.Contains((Get-CodeKey $Only))) {
        throw "No student with code '$Only' needs an account (check the code, and that they are active and in Year 3+)."
    }

    # 2. Compare with Microsoft 365. A dry run signs in read-only.
    Write-SyncLog "Connecting to Microsoft Graph ($(if ($write) { 'read/write' } else { 'read-only' }))..."
    Connect-SyncGraph -Write:$write -Device:$Device
    Write-SyncLog 'Reading users, groups and licences...'
    $state = Get-GraphTenantState
    $plan = New-StudentPlan -Desired $desired -State $state -Config $Config -OnlyCode $Only

    if ($ApplyTeamChanges) {
        exit (Invoke-ApprovedTeamChangeStep -Path $ApplyTeamChanges -Plan $plan -MaxAgeHours $maxAge)
    }
    if ($ApplySignInBlocks) {
        exit (Invoke-ApprovedSignInBlockStep -Path $ApplySignInBlocks -Plan $plan -MaxAgeHours $maxAge)
    }

    Write-PlanDetails -Plan $plan
    Write-CountSummary -Desired $desired -Plan $plan

    # 3. Reports.
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $studentsPath = Save-PrivateCsv -Path (Get-ReportPath -Directory $ReportDirectory -Prefix 'students' -Stamp $stamp) -Rows $plan.Rows
    $teamRows = @(ConvertTo-TeamChangeRows -TeamChanges $plan.TeamChanges -GeneratedAt ((Get-Date).ToString('o')))
    $teamPath = Save-PrivateCsv -Path (Get-ReportPath -Directory $ReportDirectory -Prefix 'team-changes' -Stamp $stamp) `
        -Rows $teamRows -Columns $script:TeamChangeColumns
    $blockRows = @(ConvertTo-SignInBlockRows -SignInBlocks $plan.SignInBlocks -GeneratedAt ((Get-Date).ToString('o')))
    $blockPath = Save-PrivateCsv -Path (Get-ReportPath -Directory $ReportDirectory -Prefix 'sign-in-blocks' -Stamp $stamp) `
        -Rows $blockRows -Columns $script:SignInBlockColumns
    Write-Host ''
    Write-Host 'Reports (personal data; gitignored, owner-only - do not share):'
    Write-Host "  Reconciliation: $studentsPath"
    Write-Host "  Team changes:   $teamPath"
    Write-Host "  Sign-in blocks: $blockPath"

    $total = $plan.Creates.Count + $plan.Links.Count + $plan.Updates.Count + $plan.Licenses.Count
    $blocking = @($plan.Issues | Where-Object { $script:BlockingIssues -contains $_.Type }).Count -gt 0

    if ($plan.TeamGuardTripped -and -not $Force) {
        Write-SyncLog -Level ERROR ("ABORTED: Team removals exceed {0}% of managed memberships ({1:N1}%). Check the source data, then re-run with -Force if this is expected." -f $Config.MaxTeamRemovalPercent, $plan.TeamRemovalPercent)
        exit 2
    }
    if (-not $Apply) {
        Write-SyncLog "Dry run complete: $total account change(s) and $($plan.TeamChanges.Count) Team change(s) planned, none made. Re-run with -Apply to make the account changes."
        if ($blocking) {
            Write-SyncLog -Level WARN 'Some students need fixing in the portal or config.psd1 (NO CODE / UNKNOWN YEAR GROUP above).'
            exit 3
        }
        exit 0
    }

    # 4. Apply the account changes (never Teams).
    if ($plan.BlocksApply) {
        Write-SyncLog -Level ERROR 'ABORTED: some year groups are in neither EligibleYearGroups nor IgnoredYearGroups, so it is unclear who needs an account. Add them to config.psd1 and run again. Nothing was changed.'
        exit 1
    }
    if ($total -eq 0) {
        Write-SyncLog 'No account changes needed.'
    }
    else {
        $initialPassword = [string]$env:M365_STUDENT_INITIAL_PASSWORD
        if ($plan.Creates.Count -gt 0) {
            Write-SyncLog "Initial password for new accounts: $(if ($initialPassword) { 'the shared one from M365_STUDENT_INITIAL_PASSWORD' } else { 'random, one per account' }) (must be changed at first sign-in)"
        }
        $result = Invoke-AccountPlan -Plan $plan -InitialPassword $initialPassword
        Write-SyncLog '--- Applied (counts only) ---'
        Write-SyncLog "Created: $($result.Created)  Linked: $($result.Linked)  Updated: $($result.Updated)  Licensed: $($result.Licensed)  Failed: $($result.Failed)"
        if ($result.NewAccounts.Count -gt 0) {
            $passwordsPath = Save-PrivateCsv -Path (Get-ReportPath -Directory $ReportDirectory -Prefix 'new-accounts' -Stamp $stamp) -Rows $result.NewAccounts
            Write-Host ''
            Write-Host "Initial passwords for $($result.NewAccounts.Count) new account(s): $passwordsPath" -ForegroundColor Magenta
            Write-Host 'Students must change them at first sign-in. Hand them out securely, then delete the file.' -ForegroundColor Magenta
        }
        if ($result.Failed -gt 0) {
            Write-SyncLog -Level WARN 'Some changes failed (see errors above). Re-running is safe: it retries only what is still out of sync.'
            exit 3
        }
    }
    if ($plan.TeamChanges.Count -gt 0) {
        Write-SyncLog "Team membership was not changed. Review $teamPath, set Approved to yes on the rows to apply, then run -ApplyTeamChanges with that file."
    }
    if ($blocking) {
        Write-SyncLog -Level WARN 'Some students need fixing in the portal (NO CODE above).'
        exit 3
    }
    exit 0
}
catch {
    Write-SyncLog -Level ERROR "FATAL: $($_.Exception.Message)"
    exit 1
}
