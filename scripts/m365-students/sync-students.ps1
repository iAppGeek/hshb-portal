#Requires -Version 7.2
<#
.SYNOPSIS
  Compares the students who need a Microsoft 365 account (Year 3 and up)
  with Microsoft 365 and reports every difference.

.DESCRIPTION
  Dry run: reads data/students.json (from fetch-students.sh) and Microsoft
  365 with read-only permissions, shows every change the Microsoft side
  needs, and writes two owner-only CSV reports to reports/:
    students-<stamp>.csv      one row per student / managed account
    team-changes-<stamp>.csv  proposed Team changes, for review
  Nothing is changed. See README.md.

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
#>
[CmdletBinding()]
param(
    [string]$Only,
    [switch]$Device,
    [switch]$ShowEmails,
    [string]$DataPath = (Join-Path $PSScriptRoot 'data/students.json'),
    [string]$ReportDirectory = (Join-Path $PSScriptRoot 'reports'),
    [string]$LogDirectory = (Join-Path $PSScriptRoot 'logs'),
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
            -ConsoleMessage "  + CREATE   $($i.DisplayName) [$($i.Code)] <$(Format-Upn $i.Upn)> $($i.Department)"
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
    foreach ($group in ($Desired.Students.Values | Group-Object Department | Sort-Object Name)) {
        Write-SyncLog "    $($group.Name): $($group.Count)"
    }
    foreach ($s in $Desired.Skipped) { Write-SyncLog -Level WARN "Skipped in the database ($($s.reason)): $($s.count)" }
    Write-SyncLog "Accounts to create:           $($Plan.Creates.Count)"
    Write-SyncLog "Existing accounts to link:    $($Plan.Links.Count)"
    Write-SyncLog "Accounts to update:           $($Plan.Updates.Count)"
    Write-SyncLog "Licences to assign:           $($Plan.Licenses.Count)"
    Write-SyncLog "Team changes for review:      $(@($Plan.TeamChanges | Where-Object Action -eq 'ADD').Count) add, $(@($Plan.TeamChanges | Where-Object Action -eq 'REMOVE').Count) remove"
    Write-SyncLog ("  removals: {0:N1}% of {1} managed Team memberships (limit {2}%)" -f $Plan.TeamRemovalPercent, $Plan.ManagedMembershipCount, $Config.MaxTeamRemovalPercent)
    foreach ($group in ($Plan.Issues | Group-Object Type | Sort-Object Name)) {
        Write-SyncLog -Level WARN "Report only - $($group.Name): $($group.Count)"
    }
}

$Config = Import-StudentConfig -Path $ConfigPath -ContactSyncConfigPath (Join-Path $PSScriptRoot '../m365-sync/config.psd1')
Import-DotEnv -Path (Join-Path $PSScriptRoot '.env')
$retention = if ($Config.ContainsKey('LogRetentionDays')) { [int]$Config.LogRetentionDays } else { 30 }
$logPath = Start-SyncLog -Directory $LogDirectory -Prefix 'sync-students' -RetentionDays $retention
Write-SyncLog "Mode: DRY RUN. Log: $logPath"
if ($Only) { Write-SyncLog "Only student: $Only" }

try {
    # 1. Load the data written by fetch-students.sh.
    $maxAge = if ($Config.ContainsKey('MaxDataAgeHours')) { [double]$Config.MaxDataAgeHours } else { 24 }
    $desired = ConvertTo-DesiredStudentState -Data (Read-StudentDataFile -Path $DataPath) -Config $Config -MaxAgeHours $maxAge
    if ($Only -and -not $desired.Students.Contains((Get-CodeKey $Only))) {
        throw "No student with code '$Only' needs an account (check the code, and that they are active and in Year 3+)."
    }

    # 2. Compare with Microsoft 365 (read-only sign-in).
    Write-SyncLog 'Connecting to Microsoft Graph (read-only)...'
    Connect-SyncGraph -Device:$Device
    Write-SyncLog 'Reading users, groups and licences...'
    $state = Get-GraphTenantState
    $plan = New-StudentPlan -Desired $desired -State $state -Config $Config -OnlyCode $Only

    Write-PlanDetails -Plan $plan
    Write-CountSummary -Desired $desired -Plan $plan

    # 3. Reports.
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $studentsPath = Save-PrivateCsv -Path (Get-ReportPath -Directory $ReportDirectory -Prefix 'students' -Stamp $stamp) -Rows $plan.Rows
    $teamRows = ConvertTo-TeamChangeRows -TeamChanges $plan.TeamChanges -GeneratedAt ((Get-Date).ToString('o'))
    $teamPath = Save-PrivateCsv -Path (Get-ReportPath -Directory $ReportDirectory -Prefix 'team-changes' -Stamp $stamp) `
        -Rows $teamRows -Columns $script:TeamChangeColumns
    Write-Host ''
    Write-Host 'Reports (personal data; gitignored, owner-only - do not share):'
    Write-Host "  Reconciliation: $studentsPath"
    Write-Host "  Team changes:   $teamPath"

    $total = $plan.Creates.Count + $plan.Links.Count + $plan.Updates.Count + $plan.Licenses.Count
    Write-SyncLog "Dry run complete: $total account change(s) and $($plan.TeamChanges.Count) Team change(s) planned, none made."

    if ($plan.TeamGuardTripped) {
        Write-SyncLog -Level ERROR ("Team removals exceed {0}% of managed memberships ({1:N1}%). Check the source data." -f $Config.MaxTeamRemovalPercent, $plan.TeamRemovalPercent)
        exit 2
    }
    if (@($plan.Issues | Where-Object { $script:BlockingIssues -contains $_.Type }).Count -gt 0) {
        Write-SyncLog -Level WARN 'Some students need fixing in the portal or config.psd1 (NO CODE / UNKNOWN YEAR GROUP above).'
        exit 3
    }
    exit 0
}
catch {
    Write-SyncLog -Level ERROR "FATAL: $($_.Exception.Message)"
    exit 1
}
