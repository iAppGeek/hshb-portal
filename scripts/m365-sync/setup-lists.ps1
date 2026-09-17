#Requires -Version 7.2
<#
.SYNOPSIS
  Creates or updates the dynamic distribution lists defined in config.psd1
  and previews their membership.

.DESCRIPTION
  Dry run by default. Pass -Apply to make changes. Safe to run again.

  New lists get a custom filter:
    (RecipientType -eq 'MailContact') -and (<MembershipAttribute> -eq '<Tag>')
  or, with IncludeUserAccounts = $true, mail contacts plus user mailboxes and
  mail users carrying the same attribute (e.g. teachers' school accounts).

  Lists that were built in the Exchange admin centre ("precanned" rules)
  can't be converted to a custom filter, so they are updated in place to the
  equivalent rules: include mail contacts (and mailbox/mail users when
  IncludeUserAccounts is set), and <MembershipAttribute> equals
  <Tag>. Any other rules on them (e.g. Company = Teacher) are reported and
  left alone - remove them in the admin centre once the sync has tagged
  everyone, because rules are ANDed.

.PARAMETER Apply
  Make the changes. Without this the script only reports.

.PARAMETER ShowMembers
  List the name and email of each previewed member (personal data).

.PARAMETER Device
  Sign in with a device code instead of a browser window.
#>
[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$ShowMembers,
    [switch]$Device,
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.psd1')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'lib/Common.ps1')
. (Join-Path $PSScriptRoot 'lib/Exchange.ps1')

function Get-ListFilter {
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$Attribute,
        [Parameter(Mandatory)][string]$Tag,
        [bool]$IncludeUserAccounts
    )
    $types = if ($IncludeUserAccounts) {
        "((RecipientType -eq 'MailContact') -or (RecipientType -eq 'UserMailbox') -or (RecipientType -eq 'MailUser'))"
    }
    else { "(RecipientType -eq 'MailContact')" }
    return "$types -and ($Attribute -eq '$Tag')"
}

function Find-DynamicList {
    [OutputType([object])]
    param([Parameter(Mandatory)][hashtable]$List)
    foreach ($identity in @($List.Alias, $List.Name)) {
        $group = Get-DynamicDistributionGroup -Identity $identity -ErrorAction SilentlyContinue
        if ($group) { return $group }
    }
    return $null
}

function Get-OtherPrecannedRules {
    [OutputType([string[]])]
    param([Parameter(Mandatory)][object]$Group, [Parameter(Mandatory)][string]$OurAttribute)

    $names = @('ConditionalCompany', 'ConditionalDepartment', 'ConditionalStateOrProvince') +
    (1..15 | ForEach-Object { "ConditionalCustomAttribute$_" })
    $found = foreach ($name in $names) {
        if ($name -eq "Conditional$OurAttribute") { continue }
        $values = @(Get-OptionalProperty $Group $name | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
        if ($values.Count -gt 0) { "$($name -replace '^Conditional', '') = $($values -join ' or ')" }
    }
    return @($found)
}

function Write-Preview {
    [OutputType([void])]
    param([Parameter(Mandatory)][string]$Label, [Parameter(Mandatory)][string]$Filter)

    $members = @(Get-Recipient -RecipientPreviewFilter $Filter -ResultSize Unlimited)
    Write-SyncLog "  $Label : $($members.Count) recipient(s)"
    if ($ShowMembers) {
        Write-Host '  *** MEMBER LIST BELOW CONTAINS NAMES AND EMAIL ADDRESSES (personal data). ***' -ForegroundColor Magenta
        foreach ($m in $members | Sort-Object DisplayName) {
            Write-Host "    $($m.DisplayName) <$($m.PrimarySmtpAddress)>"
        }
    }
}

$config = Import-SyncConfig -Path $ConfigPath
Import-DotEnv -Path (Join-Path $PSScriptRoot '.env')
$retention = if ($config.ContainsKey('LogRetentionDays')) { [int]$config.LogRetentionDays } else { 30 }
$logPath = Start-SyncLog -Directory (Join-Path $PSScriptRoot 'logs') -Prefix 'setup-lists' -RetentionDays $retention
Write-SyncLog "Mode: $(if ($Apply) { 'APPLY' } else { 'DRY RUN' }). Log: $logPath"

try {
    if (-not $config.ContainsKey('Lists') -or @($config.Lists).Count -eq 0) { throw 'Config has no Lists.' }
    $senders = @($config['AllowedSenders'] | Where-Object { $_ })
    if ($senders.Count -eq 0) { throw 'Config AllowedSenders is empty: lists must be restricted to named senders.' }
    $attributeByTag = @{}
    foreach ($t in $config.Tags) { $attributeByTag[$t.Tag] = $t.MembershipAttribute }

    Connect-SyncExchange -UserPrincipalName $env:M365_ADMIN_UPN -Device:$Device

    foreach ($sender in $senders) {
        if (-not (Get-Recipient -Identity $sender -ErrorAction SilentlyContinue)) {
            throw "Allowed sender '$sender' was not found in Exchange."
        }
    }

    $failed = 0
    foreach ($list in $config.Lists) {
        Write-SyncLog ''
        Write-SyncLog "List '$($list.Name)' (tag $($list.Tag))"
        try {
            if (-not $attributeByTag.ContainsKey($list.Tag)) { throw "Tag '$($list.Tag)' is not defined in config Tags." }
            $attribute = $attributeByTag[$list.Tag]
            $includeAccounts = $list['IncludeUserAccounts'] -eq $true
            $filter = Get-ListFilter -Attribute $attribute -Tag $list.Tag -IncludeUserAccounts $includeAccounts
            $included = if ($includeAccounts) { 'MailboxUsers, MailUsers, MailContacts' } else { 'MailContacts' }
            $settings = @{
                AcceptMessagesOnlyFromSendersOrMembers = $senders
                RequireSenderAuthenticationEnabled     = $true
                HiddenFromAddressListsEnabled          = $true
            }

            $group = Find-DynamicList -List $list
            if (-not $group) {
                Write-SyncLog "  Will create with filter: $filter"
                if ($Apply) {
                    $group = New-DynamicDistributionGroup -Name $list.Name -Alias $list.Alias -RecipientFilter $filter
                    Invoke-WithRetry { Set-DynamicDistributionGroup -Identity ([string]$group.Guid) @settings } | Out-Null
                    Write-SyncLog "  Created $($group.PrimarySmtpAddress)"
                }
            }
            elseif ([string]$group.RecipientFilterType -eq 'Custom') {
                Write-SyncLog "  Exists (custom filter). Current filter: $($group.RecipientFilter)"
                Write-SyncLog "  Will replace it with: $filter"
                if ($Apply) {
                    Set-DynamicDistributionGroup -Identity ([string]$group.Guid) -RecipientFilter $filter @settings
                    Write-SyncLog '  Updated'
                }
            }
            else {
                Write-SyncLog "  Exists with admin-centre rules ($($group.RecipientFilterType)). Will set: include $included; $attribute = $($list.Tag)"
                $others = Get-OtherPrecannedRules -Group $group -OurAttribute $attribute
                foreach ($rule in $others) {
                    Write-SyncLog -Level WARN "  Other rule still present: $rule. Rules are ANDed - remove it in the Exchange admin centre once the sync has been applied."
                }
                if ($Apply) {
                    $precanned = @{ IncludedRecipients = $included; "Conditional$attribute" = $list.Tag }
                    Set-DynamicDistributionGroup -Identity ([string]$group.Guid) @precanned @settings
                    Write-SyncLog '  Updated'
                }
            }
            Write-SyncLog "  Senders restricted to $($senders.Count) named sender(s); sender authentication required; hidden from address lists."

            if ($group) {
                $group = Get-DynamicDistributionGroup -Identity ([string]$group.Guid)
                Write-Preview -Label 'Current membership preview' -Filter $group.RecipientFilter
            }
            if (-not $Apply) {
                Write-Preview -Label 'Tagged recipients matching the target filter' -Filter $filter
            }
        }
        catch {
            $failed++
            Write-SyncLog -Level ERROR "  FAILED: $($_.Exception.Message)"
        }
    }

    Write-SyncLog ''
    Write-SyncLog 'Note: dynamic list membership can take up to ~24 hours to refresh after changes.'
    if (-not $Apply) { Write-SyncLog 'Dry run: no changes made. Re-run with -Apply.' }
    if ($failed -gt 0) { exit 3 }
}
catch {
    Write-SyncLog -Level ERROR "FATAL: $($_.Exception.Message)"
    exit 1
}
