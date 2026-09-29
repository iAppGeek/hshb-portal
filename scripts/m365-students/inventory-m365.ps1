#Requires -Version 7.2
<#
.SYNOPSIS
  Read-only export of the Microsoft 365 tenant: users, Microsoft 365 groups
  and Teams, and licences. Changes nothing.

.DESCRIPTION
  Signs in to Microsoft Graph with read-only permissions and writes three
  owner-only CSV files to reports/:
    inventory-users-<stamp>.csv     one row per user: names, username,
                                    enabled, Employee ID, Department,
                                    CustomAttribute1-15, licences, groups
    inventory-teams-<stamp>.csv     one row per Microsoft 365 group/Team
    inventory-licences-<stamp>.csv  licence SKUs, used and available
  The screen shows counts only. No database access is needed.

.PARAMETER Device
  Sign in with a device code instead of a browser window.

.EXAMPLE
  pwsh ./inventory-m365.ps1
#>
[CmdletBinding()]
param(
    [switch]$Device,
    [string]$ReportDirectory = (Join-Path $PSScriptRoot 'reports'),
    [string]$LogDirectory = (Join-Path $PSScriptRoot 'logs'),
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.psd1')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot '../m365-sync/lib/Common.ps1')
. (Join-Path $PSScriptRoot 'lib/StudentConfig.ps1')
. (Join-Path $PSScriptRoot 'lib/Graph.ps1')
. (Join-Path $PSScriptRoot 'lib/Reports.ps1')
. (Join-Path $PSScriptRoot 'lib/Inventory.ps1')

$config = Import-StudentConfig -Path $ConfigPath -ContactSyncConfigPath (Join-Path $PSScriptRoot '../m365-sync/config.psd1')
Import-DotEnv -Path (Join-Path $PSScriptRoot '.env')
$retention = if ($config.ContainsKey('LogRetentionDays')) { [int]$config.LogRetentionDays } else { 30 }
$logPath = Start-SyncLog -Directory $LogDirectory -Prefix 'inventory' -RetentionDays $retention
Write-SyncLog "Mode: READ ONLY. Log: $logPath"

try {
    Write-SyncLog 'Connecting to Microsoft Graph (read-only)...'
    Connect-SyncGraph -Device:$Device
    Write-SyncLog 'Reading users, groups and licences...'
    $state = Get-GraphTenantState
    $rows = Get-InventoryRows -State $state -Config $config

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $usersPath = Save-PrivateCsv -Path (Get-ReportPath -Directory $ReportDirectory -Prefix 'inventory-users' -Stamp $stamp) -Rows $rows.Users
    $teamsPath = Save-PrivateCsv -Path (Get-ReportPath -Directory $ReportDirectory -Prefix 'inventory-teams' -Stamp $stamp) -Rows $rows.Teams
    $licencesPath = Save-PrivateCsv -Path (Get-ReportPath -Directory $ReportDirectory -Prefix 'inventory-licences' -Stamp $stamp) -Rows $rows.Licences

    Write-SyncLog '--- Summary (counts only) ---'
    foreach ($line in $rows.Summary) { Write-SyncLog $line }
    Write-Host ''
    Write-Host 'Saved (personal data; gitignored, owner-only - do not share):'
    Write-Host "  $usersPath"
    Write-Host "  $teamsPath"
    Write-Host "  $licencesPath"
    Write-SyncLog 'Inventory complete. Nothing was changed.'
}
catch {
    Write-SyncLog -Level ERROR "FATAL: $($_.Exception.Message)"
    exit 1
}
