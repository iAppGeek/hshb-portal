#Requires -Version 7.2
<#
.SYNOPSIS
  Applies the contact data from fetch-contacts.sh to Exchange Online mail
  contacts, tagged for dynamic distribution lists.

.DESCRIPTION
  Dry run by default: prints the planned adds, updates and removals and
  changes nothing. Pass -Apply to make changes. See README.md.

.PARAMETER DataPath
  Contact data written by fetch-contacts.sh. Deleted after a fully
  successful -Apply unless -KeepData is passed.

.PARAMETER Apply
  Make the planned changes. Without this the script is a dry run.

.PARAMETER Force
  Proceed even if removals exceed MaxRemovalPercent of managed objects.

.PARAMETER Device
  Sign in with a device code instead of a browser window.

.PARAMETER ShowEmails
  Show full email addresses in the detailed plan on screen. They are never
  written to the log file.

.PARAMETER KeepData
  Don't delete the contact data file after a successful -Apply.

.EXAMPLE
  ./fetch-contacts.sh
  pwsh ./sync-contacts.ps1
  pwsh ./sync-contacts.ps1 -Apply
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Apply,
    [switch]$Force,
    [switch]$Device,
    [switch]$ShowEmails,
    [switch]$KeepData,
    [string]$DataPath = (Join-Path $PSScriptRoot 'data/contacts.json'),
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.psd1')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'lib/Common.ps1')
. (Join-Path $PSScriptRoot 'lib/ContactData.ps1')
. (Join-Path $PSScriptRoot 'lib/Exchange.ps1')

if ($DryRun -and $Apply) { throw 'Use either -DryRun or -Apply, not both.' }

function Format-Email {
    [OutputType([string])]
    param([AllowNull()][string]$Email)
    if ($ShowEmails) { return $Email }
    return Protect-Email $Email
}

function Format-Changes {
    [OutputType([string])]
    param([System.Collections.IDictionary[]]$ChangeSets)
    $parts = foreach ($set in $ChangeSets) {
        foreach ($key in $set.Keys) { "$key '$($set[$key].From)' -> '$($set[$key].To)'" }
    }
    return $parts -join '; '
}

function Write-PlanDetails {
    [OutputType([void])]
    param([Parameter(Mandatory)][hashtable]$Plan)

    Write-Host ''
    if ($ShowEmails) {
        Write-Host '*** DETAILED PLAN BELOW CONTAINS FULL EMAIL ADDRESSES (personal data). Do not copy or share it. ***' -ForegroundColor Magenta
    }
    else {
        Write-Host 'Detailed plan (names shown on screen only; emails masked - use -ShowEmails to see them in full):' -ForegroundColor Cyan
    }

    foreach ($i in $Plan.Adds) {
        Write-SyncLog "PLAN ADD    $(Protect-Email $i.Email) [$($i.PrimaryTag)]" `
            -ConsoleMessage "  + ADD     $($i.DisplayName) <$(Format-Email $i.Email)> [$($i.PrimaryTag)]"
    }
    foreach ($i in $Plan.Updates) {
        $adopt = if ($i.Adopted) { ' (adopting existing contact)' } else { '' }
        $fields = (@($i.ContactChanges.Keys) + @($i.MailContactChanges.Keys)) -join ', '
        Write-SyncLog "PLAN UPDATE $(Protect-Email $i.Email) [$($i.PrimaryTag)]$adopt fields: $fields" `
            -ConsoleMessage "  ~ UPDATE  $($i.DisplayName) <$(Format-Email $i.Email)>$adopt : $(Format-Changes @($i.ContactChanges, $i.MailContactChanges))"
    }
    foreach ($i in $Plan.Removals) {
        Write-SyncLog "PLAN REMOVE $(Protect-Email $i.Email) [$($i.PrimaryTag)]" `
            -ConsoleMessage "  - REMOVE  $($i.DisplayName) <$(Format-Email $i.Email)> [$($i.PrimaryTag)]"
    }
    foreach ($i in $Plan.AccountChanges) {
        Write-SyncLog "PLAN ACCOUNT $(Protect-Email $i.Email) [$($i.Tag)] $(Format-Changes @($i.Changes))" `
            -ConsoleMessage "  * ACCOUNT $($i.DisplayName) <$(Format-Email $i.Email)> ($($i.RecipientTypeDetails)): $(Format-Changes @($i.Changes))"
    }
    foreach ($i in $Plan.Conflicts) {
        Write-SyncLog -Level WARN "CONFLICT $(Protect-Email $i.Email) [$($i.PrimaryTag)]: $($i.Reason)" `
            -ConsoleMessage "  ! SKIP    $($i.DisplayName) <$(Format-Email $i.Email)> [$($i.PrimaryTag)]: $($i.Reason)"
    }
    foreach ($i in $Plan.AccountSkips) {
        Write-SyncLog -Level WARN "ACCOUNT SKIP $(Protect-Email $i.Email) [$($i.Role)]: $($i.Reason)" `
            -ConsoleMessage "  ! SKIP    account <$(Format-Email $i.Email)> [$($i.Role)]: $($i.Reason)"
    }
    Write-Host ''
}

function Write-CountSummary {
    [OutputType([void])]
    param(
        [Parameter(Mandatory)][hashtable]$Desired,
        [Parameter(Mandatory)][hashtable]$Plan
    )

    Write-SyncLog '--- Summary (counts only) ---'
    foreach ($role in $Desired.Roles) {
        Write-SyncLog "Source rows ($($role['tag'])): $($role['rows'])"
    }
    Write-SyncLog "Unique contacts wanted:     $($Desired.Contacts.Count) (rows merged by email: $($Desired.Merged))"
    foreach ($group in ($Desired.Contacts.Values | ForEach-Object { $_.Tags } | Group-Object | Sort-Object Name)) {
        Write-SyncLog "  with role $($group.Name): $($group.Count)"
    }
    $multi = @($Desired.Contacts.Values | Where-Object { $_.Tags.Count -gt 1 }).Count
    Write-SyncLog "  with more than one role:  $multi"
    foreach ($s in $Desired.Skipped) {
        Write-SyncLog -Level WARN "Skipped rows ($($s.role), $($s.reason)): $($s.count)"
    }
    Write-SyncLog "Managed contacts now:       $($Plan.ManagedContactCount)"
    Write-SyncLog "Planned adds:               $($Plan.Adds.Count)"
    Write-SyncLog "Planned updates:            $($Plan.Updates.Count) (of which adoptions: $(@($Plan.Updates | Where-Object Adopted).Count))"
    Write-SyncLog ("Planned removals:           {0} ({1:N1}% of managed)" -f $Plan.Removals.Count, $Plan.ContactRemovalPercent)
    Write-SyncLog "Conflicts skipped:          $($Plan.Conflicts.Count)"
    Write-SyncLog "Account tag changes:        $($Plan.AccountChanges.Count) (tagged accounts now: $($Plan.ManagedAccountCount))"
    Write-SyncLog "Accounts skipped:           $($Plan.AccountSkips.Count)"
}

$config = Import-SyncConfig -Path $ConfigPath
Import-DotEnv -Path (Join-Path $PSScriptRoot '.env')
$retention = if ($config.ContainsKey('LogRetentionDays')) { [int]$config.LogRetentionDays } else { 30 }
$logPath = Start-SyncLog -Directory (Join-Path $PSScriptRoot 'logs') -Prefix 'sync-contacts' -RetentionDays $retention
$mode = if ($Apply) { 'APPLY' } else { 'DRY RUN' }
Write-SyncLog "Mode: $mode. Log: $logPath"

try {
    # 1. Load the data written by fetch-contacts.sh.
    $maxAge = if ($config.ContainsKey('MaxDataAgeHours')) { [double]$config.MaxDataAgeHours } else { 24 }
    $data = Read-ContactDataFile -Path $DataPath
    $desired = ConvertTo-DesiredState -Data $data -Config $config -MaxAgeHours $maxAge

    # 2. Compare with Exchange.
    Write-SyncLog 'Connecting to Exchange Online...'
    Connect-SyncExchange -UserPrincipalName $env:M365_ADMIN_UPN -Device:$Device
    Write-SyncLog 'Reading contacts and recipients from Exchange...'
    $state = Get-ExchangeState
    $plan = New-SyncPlan -Desired $desired -State $state -Config $config

    Write-PlanDetails -Plan $plan
    Write-CountSummary -Desired $desired -Plan $plan

    if ($plan.RemovalGuardTripped -and -not $Force) {
        Write-SyncLog -Level ERROR ("ABORTED: removals exceed {0}% of managed objects (contacts {1:N1}%, accounts {2:N1}%). Check the source data, then re-run with -Force if this is expected." -f $config.MaxRemovalPercent, $plan.ContactRemovalPercent, $plan.AccountRemovalPercent)
        exit 2
    }

    $total = $plan.Adds.Count + $plan.Updates.Count + $plan.Removals.Count + $plan.AccountChanges.Count
    if (-not $Apply) {
        Write-SyncLog "Dry run complete: $total change(s) planned, none made. Re-run with -Apply to make them."
        exit 0
    }
    if ($total -eq 0) {
        Write-SyncLog 'Nothing to change. Exchange is already in sync.'
        if (-not $KeepData) { Remove-Item -LiteralPath $DataPath -Force }
        exit 0
    }

    # 3. Apply.
    $result = Invoke-SyncPlan -Plan $plan
    Write-SyncLog '--- Applied (counts only) ---'
    Write-SyncLog "Added: $($result.Added)  Updated: $($result.Updated)  Removed: $($result.Removed)  Accounts: $($result.AccountsUpdated)  Failed: $($result.Failed)"
    if ($result.Failed -gt 0) {
        Write-SyncLog -Level WARN 'Some changes failed (see errors above). Re-running is safe: it will retry only what is still out of sync.'
        exit 3
    }
    if (-not $KeepData) {
        Remove-Item -LiteralPath $DataPath -Force
        Write-SyncLog 'Deleted the local contact data file.'
    }
    Write-SyncLog 'Done. Dynamic list membership can take up to ~24 hours to reflect these changes.'
}
catch {
    Write-SyncLog -Level ERROR "FATAL: $($_.Exception.Message)"
    exit 1
}
