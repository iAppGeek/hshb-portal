#Requires -Version 7.2
# Loads and checks config.psd1, and guards against clashing with the contact
# sync in ../m365-sync (which owns CustomAttribute1 values it lists in Tags).

Set-StrictMode -Version Latest

function Import-StudentConfig {
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][string]$Path,
        # ../m365-sync/config.psd1; checked read-only for clashes.
        [string]$ContactSyncConfigPath
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Config file not found: $Path. Pass -ConfigPath or restore config.psd1 from git."
    }
    $config = Import-PowerShellDataFile -LiteralPath $Path
    Assert-StudentConfig -Config $config

    if ($ContactSyncConfigPath) {
        if (Test-Path -LiteralPath $ContactSyncConfigPath) {
            $contactConfig = Import-PowerShellDataFile -LiteralPath $ContactSyncConfigPath
            Assert-NoContactSyncClash -Config $config -ContactConfig $contactConfig
        }
        else {
            Write-Warning "Contact sync config not found at $ContactSyncConfigPath; skipped the clash check."
        }
    }
    return $config
}

function Assert-StudentConfig {
    [OutputType([void])]
    param([Parameter(Mandatory)][hashtable]$Config)

    $required = @(
        'Domain', 'UsageLocation', 'Tag', 'MembershipAttribute', 'EligibleYearGroups', 'IgnoredYearGroups',
        'ClassTeamNameFormat', 'YearTeamNameFormat', 'TeamNicknamePrefix', 'MaxTeamRemovalPercent'
    )
    foreach ($key in $required) {
        if (-not $Config.ContainsKey($key)) { throw "Config is missing '$key'." }
    }
    if ([string]$Config.Domain -cnotmatch '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$') {
        throw "Domain '$($Config.Domain)' is not a valid lowercase domain name."
    }
    if ([string]$Config.UsageLocation -cnotmatch '^[A-Z]{2}$') {
        throw 'UsageLocation must be a two-letter country code, e.g. GB.'
    }
    if ([string]$Config.Tag -notmatch '^[A-Za-z0-9]+$') {
        throw "Tag '$($Config.Tag)' must be letters and digits only (it is used in list filters)."
    }
    if ([string]$Config.MembershipAttribute -notmatch '^CustomAttribute([2-9]|1[0-5])$') {
        throw 'MembershipAttribute must be CustomAttribute2 to CustomAttribute15 (CustomAttribute1 holds the tag).'
    }
    if ([string]$Config.TeamNicknamePrefix -cnotmatch '^[a-z0-9][a-z0-9-]*$') {
        throw 'TeamNicknamePrefix must be lowercase letters, digits and hyphens.'
    }
    if (@($Config.EligibleYearGroups).Count -eq 0) { throw 'EligibleYearGroups must list at least one year group.' }

    $seen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($group in @($Config.EligibleYearGroups) + @($Config.IgnoredYearGroups)) {
        $value = ([string]$group).Trim()
        if ($value -eq '') { throw 'Year group lists must not contain empty values.' }
        if (-not $seen.Add($value)) {
            throw "Year group '$value' is listed more than once (a year group must be eligible or ignored, not both)."
        }
    }
    $percent = $Config.MaxTeamRemovalPercent -as [double]
    if ($null -eq $percent -or $percent -lt 0 -or $percent -gt 100) {
        throw 'MaxTeamRemovalPercent must be a number from 0 to 100.'
    }
}

function Assert-NoContactSyncClash {
    <#
      The contact sync treats any account whose CustomAttribute1 is one of its
      tags as its own, and clears tags it no longer wants. If the student tag
      were one of its tags, every student account would be untagged on its
      next run; if it used our membership attribute, the two would overwrite
      each other.
    #>
    [OutputType([void])]
    param(
        [Parameter(Mandatory)][hashtable]$Config,
        [Parameter(Mandatory)][hashtable]$ContactConfig
    )

    foreach ($role in @($ContactConfig['Tags'])) {
        if ($null -eq $role) { continue }
        if ([string]$role['Tag'] -ieq [string]$Config.Tag) {
            throw "Tag '$($Config.Tag)' is also a tag in ../m365-sync/config.psd1. Remove it there: the contact sync would untag every student account."
        }
        if ([string]$role['MembershipAttribute'] -ieq [string]$Config.MembershipAttribute) {
            throw "$($Config.MembershipAttribute) is already used by tag '$($role['Tag'])' in ../m365-sync/config.psd1. Pick an unused attribute."
        }
    }
}

function Get-YearGroupEligibility {
    <# Returns 'Eligible', 'Ignored' or 'Unknown' for a classes.year_group value. #>
    [OutputType([string])]
    param(
        [AllowNull()][AllowEmptyString()][string]$YearGroup,
        [Parameter(Mandatory)][hashtable]$Config
    )

    $value = if ($null -eq $YearGroup) { '' } else { $YearGroup.Trim() }
    foreach ($g in @($Config.EligibleYearGroups)) { if (([string]$g).Trim() -ieq $value) { return 'Eligible' } }
    foreach ($g in @($Config.IgnoredYearGroups)) { if (([string]$g).Trim() -ieq $value) { return 'Ignored' } }
    return 'Unknown'
}
