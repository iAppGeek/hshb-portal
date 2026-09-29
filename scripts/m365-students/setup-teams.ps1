#Requires -Version 7.2
<#
.SYNOPSIS
  Creates or fixes this academic year's student Teams: one per class in an
  eligible year group, and one for the whole year.

.DESCRIPTION
  Dry run by default. Pass -Apply to make changes. Safe to run again.

  Reads data/students.json (from fetch-students.sh) for the current year's
  classes and class teachers. For each Team it expects (found by
  mailNickname, see README.md) it:
    - creates it if missing (private Microsoft 365 group, plus a Team for
      classes), with the class teacher and DefaultTeamOwners as owners; you
      (the signed-in account) also own the year group you create
    - turns an existing group into a Team if needed
    - updates the display name if the class was renamed
    - adds missing owners
  It never deletes a Team, removes an owner or changes student membership
  (that is sync-students.ps1, after review). Teams from past years are
  listed so you can archive them by hand.

.PARAMETER Apply
  Make the changes. Without this the script only reports.

.PARAMETER Device
  Sign in with a device code instead of a browser window.

.EXAMPLE
  ./fetch-students.sh
  pwsh ./setup-teams.ps1
  pwsh ./setup-teams.ps1 -Apply
#>
[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$Device,
    [string]$DataPath = (Join-Path $PSScriptRoot 'data/students.json'),
    [string]$LogDirectory = (Join-Path $PSScriptRoot 'logs'),
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.psd1')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot '../m365-sync/lib/Common.ps1')
. (Join-Path $PSScriptRoot 'lib/StudentConfig.ps1')
. (Join-Path $PSScriptRoot 'lib/StudentData.ps1')
. (Join-Path $PSScriptRoot 'lib/Graph.ps1')
. (Join-Path $PSScriptRoot 'lib/Apply.ps1')
. (Join-Path $PSScriptRoot 'lib/TeamSetup.ps1')

$config = Import-StudentConfig -Path $ConfigPath -ContactSyncConfigPath (Join-Path $PSScriptRoot '../m365-sync/config.psd1')
Import-DotEnv -Path (Join-Path $PSScriptRoot '.env')
$retention = if ($config.ContainsKey('LogRetentionDays')) { [int]$config.LogRetentionDays } else { 30 }
$logPath = Start-SyncLog -Directory $LogDirectory -Prefix 'setup-teams' -RetentionDays $retention
Write-SyncLog "Mode: $(if ($Apply) { 'APPLY' } else { 'DRY RUN' }). Log: $logPath"

try {
    $maxAge = if ($config.ContainsKey('MaxDataAgeHours')) { [double]$config.MaxDataAgeHours } else { 24 }
    $desired = ConvertTo-DesiredStudentState -Data (Read-StudentDataFile -Path $DataPath) -Config $config -MaxAgeHours $maxAge
    if (@($desired.UnknownYearGroups).Count -gt 0) {
        Write-SyncLog -Level WARN "Unknown year groups ($($desired.UnknownYearGroups -join ', ')): their classes get no Team until added to config.psd1."
    }

    Write-SyncLog "Connecting to Microsoft Graph ($(if ($Apply) { 'read/write' } else { 'read-only' }))..."
    Connect-SyncGraph -Write:$Apply -Device:$Device
    $runner = Get-SignedInUpn
    if ($runner) { Write-SyncLog "Signed in as $(Protect-Email $runner)" -ConsoleMessage "Signed in as $runner" }
    else { Write-SyncLog -Level WARN 'Could not tell who is signed in; the year group gets only DefaultTeamOwners as owners.' }
    Write-SyncLog 'Reading users and groups...'
    $state = @{ Users = Get-GraphUsers; Groups = Get-GraphUnifiedGroups }
    $plan = New-TeamSetupPlan -Desired $desired -State $state -Config $config -CreatorUpn $runner

    Write-Host ''
    foreach ($i in $plan.Creates) {
        Write-SyncLog "PLAN CREATE $($i.Nickname) owners: $($i.OwnerIds.Count)" -ConsoleMessage "  + CREATE  $($i.DisplayName) ($($i.Nickname)), $($i.OwnerIds.Count) owner(s)"
    }
    foreach ($i in $plan.EnableTeams) {
        Write-SyncLog "PLAN ENABLE $($i.Nickname)" -ConsoleMessage "  * TEAM    $($i.DisplayName) ($($i.Nickname)): turn the group into a Team"
    }
    foreach ($i in $plan.Renames) {
        Write-SyncLog "PLAN RENAME $($i.Nickname)" -ConsoleMessage "  ~ RENAME  '$($i.From)' -> '$($i.To)'"
    }
    foreach ($i in $plan.OwnerAdds) {
        Write-SyncLog "PLAN OWNER $($i.Nickname) $(Protect-Email $i.Email)" -ConsoleMessage "  + OWNER   $($i.Team): $(Protect-Email $i.Email)"
    }
    foreach ($i in $plan.Issues) {
        Write-SyncLog -Level WARN "$($i.Type): $($i.Team): $($i.Detail)"
    }
    Write-Host ''
    $wanted = 1 + @($desired.Classes.Values | Where-Object Eligibility -eq 'Eligible').Count
    Write-SyncLog '--- Summary ---'
    Write-SyncLog "Teams expected for $($desired.AcademicYear.Code): $wanted (year Team + $($wanted - 1) class Teams)"
    Write-SyncLog "To create: $($plan.Creates.Count)  to turn into Teams: $($plan.EnableTeams.Count)  to rename: $($plan.Renames.Count)  owners to add: $($plan.OwnerAdds.Count)"
    foreach ($group in ($plan.Issues | Group-Object Type | Sort-Object Name)) { Write-SyncLog -Level WARN "$($group.Name): $($group.Count)" }

    $total = $plan.Creates.Count + $plan.EnableTeams.Count + $plan.Renames.Count + $plan.OwnerAdds.Count
    if (-not $Apply) {
        Write-SyncLog "Dry run complete: $total change(s) planned, none made. Re-run with -Apply to make them."
        exit 0
    }
    if ($total -eq 0) {
        Write-SyncLog 'Nothing to change.'
        exit 0
    }

    $result = Invoke-TeamSetupPlan -Plan $plan
    Write-SyncLog '--- Applied ---'
    Write-SyncLog "Created: $($result.Created)  turned into Teams: $($result.Enabled)  renamed: $($result.Renamed)  owners added: $($result.OwnersAdded)  failed: $($result.Failed)"
    if ($result.Failed -gt 0) {
        Write-SyncLog -Level WARN 'Some changes failed (see errors above). Re-running is safe.'
        exit 3
    }
    Write-SyncLog 'Done. New Teams can take a few minutes to appear. Next: pwsh ./sync-students.ps1 (dry run).'
    exit 0
}
catch {
    Write-SyncLog -Level ERROR "FATAL: $($_.Exception.Message)"
    exit 1
}
