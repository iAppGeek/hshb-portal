#Requires -Version 7.2
# Reads the contact data file written by fetch-contacts.sh. The file is the
# contract between "fetch data" and "apply to Exchange": any other producer
# (e.g. a portal job) only has to write the same JSON.

Set-StrictMode -Version Latest

function Read-ContactDataFile {
    [OutputType([object])]
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Contact data not found: $Path. Run ./fetch-contacts.sh first."
    }
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -AsHashtable -DateKind String
}

function Get-KnownTags {
    <# The tags that are defined in the config, in their original order, without duplicates. #>
    [OutputType([System.Collections.Generic.List[string]])]
    param(
        [AllowNull()][object]$Tags,
        [Parameter(Mandatory)][string[]]$KnownTags
    )

    $result = [System.Collections.Generic.List[string]]::new()
    foreach ($t in @($Tags)) { if ($KnownTags -ccontains $t -and -not $result.Contains($t)) { $result.Add($t) } }
    return , $result
}

function ConvertTo-DesiredState {
    <#
      Pure function. Validates the data file and returns:
        Contacts : ordered map email -> person (tags in priority order)
        Accounts : map account email -> tags (priority order)
        Skipped  : list of { role, reason, count } (no personal data)
        Merged   : rows folded into an existing email by the source
        Roles    : list of { tag, rows }
      Throws on anything that could make the sync remove people by mistake.
      Individual bad contacts are skipped and counted.
    #>
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][System.Collections.IDictionary]$Data,
        [Parameter(Mandatory)][hashtable]$Config,
        [AllowNull()][object]$Now,
        [double]$MaxAgeHours = 0
    )

    if ($Data['version'] -ne 2) { throw "Unsupported contact data version '$($Data['version'])'." }
    foreach ($key in @('contacts', 'accounts', 'roles')) {
        if ($null -eq $Data[$key]) { throw "Contact data is missing '$key'." }
    }

    if ($MaxAgeHours -gt 0) {
        $generated = [datetimeoffset]::Parse([string]$Data['generatedAt'], [cultureinfo]::InvariantCulture)
        $current = if ($null -ne $Now) { [datetimeoffset]$Now } else { [datetimeoffset]::Now }
        $age = ($current - $generated).TotalHours
        if ($age -gt $MaxAgeHours) {
            throw ("Contact data is {0:N1} hours old (limit {1}). Run ./fetch-contacts.sh again." -f $age, $MaxAgeHours)
        }
    }

    $knownTags = @($Config.Tags | ForEach-Object { $_.Tag })
    foreach ($role in $Data['roles']) {
        if ($knownTags -cnotcontains $role['tag']) {
            throw "Tag '$($role['tag'])' from contacts.sql is not defined in config.psd1."
        }
        if ([int]$role['rows'] -eq 0) {
            throw "Source returned 0 rows for role '$($role['tag'])'. Aborting without changes."
        }
    }
    if (@($Data['contacts']).Count -eq 0) { throw 'Contact data has no contacts. Aborting without changes.' }

    $skipped = [System.Collections.Generic.List[object]]::new()
    foreach ($s in @($Data['skipped'])) { if ($s) { $skipped.Add([pscustomobject]$s) } }

    $contacts = [ordered]@{}
    foreach ($c in $Data['contacts']) {
        $email = Get-NormalisedEmail ([string]$c['email'])
        $tags = Get-KnownTags -Tags $c['tags'] -KnownTags $knownTags
        $role = if ($tags.Count -gt 0) { $tags[0] } else { 'unknown' }

        if (-not (Test-EmailAddress $email)) {
            $skipped.Add([pscustomobject]@{ role = $role; reason = 'invalid email (data file)'; count = 1 })
            continue
        }
        if ($tags.Count -eq 0) {
            $skipped.Add([pscustomobject]@{ role = $role; reason = 'no known tags (data file)'; count = 1 })
            continue
        }
        if ($contacts.Contains($email)) {
            throw 'Contact data contains a duplicate email address. Re-run ./fetch-contacts.sh.'
        }
        $first = ConvertTo-CleanString $c['firstName']
        $last = ConvertTo-CleanString $c['lastName']
        $contacts[$email] = [pscustomobject]@{
            Email       = $email
            FirstName   = $first
            LastName    = $last
            DisplayName = (@($first, $last) | Where-Object { $_ }) -join ' '
            Tags        = $tags
        }
    }

    $accounts = @{}
    foreach ($a in $Data['accounts']) {
        $email = Get-NormalisedEmail ([string]$a['email'])
        $tags = Get-KnownTags -Tags $a['tags'] -KnownTags $knownTags
        if ((Test-EmailAddress $email) -and $tags.Count -gt 0 -and -not $accounts.ContainsKey($email)) {
            $accounts[$email] = $tags
        }
    }

    return @{
        Contacts = $contacts
        Accounts = $accounts
        Skipped  = $skipped.ToArray()
        Merged   = [int]$Data['mergedRows']
        Roles    = @($Data['roles'])
    }
}
