#Requires -Version 7.2
# Shared helpers: configuration, .env loading, email handling and logging.
# Nothing in here talks to Supabase or Exchange.

Set-StrictMode -Version Latest

$script:ReservedTagAttribute = 'CustomAttribute1'
$script:AccountRecipientTypes = @('UserMailbox', 'SharedMailbox', 'MailUser')

function Import-SyncConfig {
    [OutputType([hashtable])]
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Config file not found: $Path. Pass -ConfigPath or restore config.psd1 from git."
    }
    $config = Import-PowerShellDataFile -LiteralPath $Path
    Assert-SyncConfig -Config $config
    return $config
}

function Assert-SyncConfig {
    [OutputType([void])]
    param([Parameter(Mandatory)][hashtable]$Config)

    foreach ($key in @('Tags', 'MaxRemovalPercent')) {
        if (-not $Config.ContainsKey($key)) { throw "Config is missing '$key'." }
    }
    if (@($Config.Tags).Count -eq 0) { throw 'Config must define at least one tag.' }

    $tags = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $attributes = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($role in $Config.Tags) {
        foreach ($key in @('Tag', 'MembershipAttribute')) {
            if (-not $role.ContainsKey($key) -or [string]::IsNullOrWhiteSpace([string]$role[$key])) {
                throw "A tag in the config is missing '$key'."
            }
        }
        if ($role.Tag -notmatch '^[A-Za-z0-9]+$') {
            throw "Role tag '$($role.Tag)' must be letters and digits only (it is used in list filters)."
        }
        if ($role.MembershipAttribute -notmatch '^CustomAttribute([2-9]|1[0-5])$') {
            throw "Role '$($role.Tag)': MembershipAttribute must be CustomAttribute2 to CustomAttribute15 (CustomAttribute1 is reserved for the primary tag)."
        }
        if (-not $tags.Add($role.Tag)) { throw "Duplicate role tag '$($role.Tag)'." }
        if (-not $attributes.Add($role.MembershipAttribute)) {
            throw "Two roles share MembershipAttribute '$($role.MembershipAttribute)'."
        }
    }
}

function Import-DotEnv {
    [OutputType([void])]
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { return }
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*(#|$)') { continue }
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
            $name = $Matches[1]
            $value = $Matches[2] -replace '^"(.*)"$', '$1' -replace "^'(.*)'$", '$1'
            # Real environment variables win over the file.
            if ([string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name))) {
                [Environment]::SetEnvironmentVariable($name, $value)
            }
        }
    }
}

function Get-NormalisedEmail {
    [OutputType([string])]
    param([AllowNull()][AllowEmptyString()][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    return $Value.Trim().ToLowerInvariant()
}

function Test-EmailAddress {
    [OutputType([bool])]
    param([AllowNull()][AllowEmptyString()][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
    # Pragmatic check: one @, no spaces, no consecutive/edge dots, domain with a TLD.
    return $Value -match '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'
}

function Protect-Email {
    [OutputType([string])]
    param([AllowNull()][AllowEmptyString()][string]$Email)

    if ([string]::IsNullOrEmpty($Email) -or $Email -notmatch '^(.)[^@]*@(.+)$') { return '***' }
    return "$($Matches[1])***@$($Matches[2])"
}

function Get-OptionalProperty {
    [OutputType([object])]
    param(
        [Parameter(Mandatory)][AllowNull()][object]$InputObject,
        [Parameter(Mandatory)][string]$Name
    )

    if ($null -eq $InputObject) { return $null }
    if ($InputObject -is [System.Collections.IDictionary]) { return $InputObject[$Name] }
    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function ConvertTo-CleanString {
    [OutputType([string])]
    param([AllowNull()][object]$Value)

    if ($null -eq $Value) { return '' }
    return ([string]$Value).Trim()
}

# --- Logging -----------------------------------------------------------------
# The log file never contains names or full email addresses: only counts,
# masked addresses and error messages.

$script:SyncLogPath = $null

function Start-SyncLog {
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$Directory,
        [Parameter(Mandatory)][string]$Prefix,
        [int]$RetentionDays = 30
    )

    New-Item -ItemType Directory -Path $Directory -Force | Out-Null
    if ($RetentionDays -gt 0) {
        Get-ChildItem -LiteralPath $Directory -Filter '*.log' |
            Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
            Remove-Item -Force
    }
    $script:SyncLogPath = Join-Path $Directory ("{0}-{1}.log" -f $Prefix, (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType File -Path $script:SyncLogPath -Force | Out-Null
    return $script:SyncLogPath
}

function Write-SyncLog {
    [OutputType([void])]
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string]$Message,
        [ValidateSet('INFO', 'WARN', 'ERROR')][string]$Level = 'INFO',
        # Text shown on screen instead of $Message (may include names/emails).
        [string]$ConsoleMessage
    )

    $screen = if ($PSBoundParameters.ContainsKey('ConsoleMessage')) { $ConsoleMessage } else { $Message }
    switch ($Level) {
        'WARN' { Write-Host $screen -ForegroundColor Yellow }
        'ERROR' { Write-Host $screen -ForegroundColor Red }
        default { Write-Host $screen }
    }
    if ($script:SyncLogPath) {
        $stamp = Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'
        Add-Content -LiteralPath $script:SyncLogPath -Value "$stamp [$Level] $Message"
    }
}
