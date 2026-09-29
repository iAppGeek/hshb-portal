#Requires -Version 7.2
# Carries out the account part of a plan: CREATE, LINK, UPDATE, LICENCE.
# Never changes Team membership (that is Invoke-TeamChanges, after review),
# and never sends a username or email address except when creating.

Set-StrictMode -Version Latest

# Unambiguous characters: no 0/O, 1/l/I.
$script:PasswordSets = @('ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789')

function New-InitialPassword {
    <# 14 random characters with upper, lower and digits; changed at first sign-in. #>
    [OutputType([string])]
    param([int]$Length = 14)

    $all = -join $script:PasswordSets
    $chars = [System.Collections.Generic.List[char]]::new()
    foreach ($set in $script:PasswordSets) { $chars.Add($set[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($set.Length)]) }
    while ($chars.Count -lt $Length) { $chars.Add($all[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($all.Length)]) }
    # Shuffle so the guaranteed characters aren't always first.
    for ($i = $chars.Count - 1; $i -gt 0; $i--) {
        $j = [System.Security.Cryptography.RandomNumberGenerator]::GetInt32($i + 1)
        $tmp = $chars[$i]; $chars[$i] = $chars[$j]; $chars[$j] = $tmp
    }
    return -join $chars
}

function ConvertTo-GraphUserPatch {
    <#
      Turns planned field changes into a Graph PATCH body. Refuses any field
      outside the whitelist, so a username or address can never be sent.
    #>
    [OutputType([hashtable])]
    param([Parameter(Mandatory)][System.Collections.IDictionary]$Changes)

    $body = @{}
    $extensions = @{}
    foreach ($field in $Changes.Keys) {
        if ($script:UserWritableFields -cnotcontains $field) {
            throw "Refusing to change '$field': only $($script:UserWritableFields -join ', ') may be updated."
        }
        $value = $Changes[$field].To
        if ($value -is [string] -and $value -eq '') { $value = $null } # Graph clears a property with null
        if ($field -match '^CustomAttribute(\d+)$') { $extensions["extensionAttribute$($Matches[1])"] = $value }
        else { $body[$field] = $value }
    }
    if ($extensions.Count -gt 0) { $body['onPremisesExtensionAttributes'] = $extensions }
    return $body
}

function ConvertTo-GraphNewUser {
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][object]$Create,
        [Parameter(Mandatory)][string]$Password
    )

    $extensions = @{}
    foreach ($field in $Create.Attributes.Keys) {
        $extensions[$field -replace '^CustomAttribute', 'extensionAttribute'] = $Create.Attributes[$field]
    }
    return @{
        accountEnabled                = $true
        displayName                   = $Create.DisplayName
        givenName                     = $Create.FirstName
        surname                       = $Create.LastName
        userPrincipalName             = $Create.Upn
        mailNickname                  = $Create.MailNickname
        usageLocation                 = $Create.UsageLocation
        employeeId                    = $Create.Code
        department                    = $Create.Department
        onPremisesExtensionAttributes = $extensions
        passwordProfile               = @{ forceChangePasswordNextSignIn = $true; password = $Password }
    }
}

function Invoke-WithRetry {
    [OutputType([object])]
    param(
        [Parameter(Mandatory)][scriptblock]$Action,
        [int]$Attempts = 3,
        [int]$DelaySeconds = 10
    )

    for ($i = 1; ; $i++) {
        try { return & $Action }
        catch {
            if ($i -ge $Attempts) { throw }
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

function Add-GraphLicence {
    [OutputType([void])]
    param([Parameter(Mandatory)][string]$UserId, [Parameter(Mandatory)][string]$SkuId, [int]$RetryDelaySeconds = 10)

    $body = @{ addLicenses = @(@{ skuId = $SkuId; disabledPlans = @() }); removeLicenses = @() }
    # A new user can take a few seconds to become licensable.
    Invoke-WithRetry -DelaySeconds $RetryDelaySeconds -Action {
        Invoke-StudentGraph -Method POST -Uri "v1.0/users/$UserId/assignLicense" -Body $body
    } | Out-Null
}

function Invoke-AccountPlan {
    <#
      Applies Creates, Links, Updates and Licenses. Each item has its own
      try/catch so one failure doesn't stop the run. Returns counts and the
      new accounts' initial passwords (for the owner-only hand-out file).
    #>
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][hashtable]$Plan,
        [int]$RetryDelaySeconds = 10
    )

    $result = @{ Created = 0; Linked = 0; Updated = 0; Licensed = 0; Failed = 0 }
    $newAccounts = [System.Collections.Generic.List[object]]::new()

    foreach ($item in $Plan.Creates) {
        $password = New-InitialPassword
        try {
            $created = Invoke-StudentGraph -Method POST -Uri 'v1.0/users' -Body (ConvertTo-GraphNewUser -Create $item -Password $password)
        }
        catch {
            $result.Failed++
            Write-SyncLog -Level ERROR "FAILED create [$($item.Code)] $(Protect-Email $item.Upn): $($_.Exception.Message)"
            continue
        }
        # Record the password as soon as the account exists, even if the licence fails.
        $newAccounts.Add([pscustomobject][ordered]@{
                StudentCode = $item.Code; Name = $item.DisplayName; Upn = $item.Upn; InitialPassword = $password
            })
        $result.Created++
        Write-SyncLog "CREATED [$($item.Code)] $(Protect-Email $item.Upn)"
        if ($item.SkuId) {
            try {
                Add-GraphLicence -UserId ([string]$created['id']) -SkuId $item.SkuId -RetryDelaySeconds $RetryDelaySeconds
                $result.Licensed++
            }
            catch {
                $result.Failed++
                Write-SyncLog -Level ERROR "FAILED licence [$($item.Code)] $(Protect-Email $item.Upn): $($_.Exception.Message). Re-run to retry."
            }
        }
    }

    foreach ($kind in @('Links', 'Updates')) {
        foreach ($item in $Plan[$kind]) {
            try {
                Invoke-StudentGraph -Method PATCH -Uri "v1.0/users/$($item.UserId)" -Body (ConvertTo-GraphUserPatch -Changes $item.Changes) | Out-Null
                if ($kind -eq 'Links') { $result.Linked++ } else { $result.Updated++ }
                Write-SyncLog "$(if ($kind -eq 'Links') { 'LINKED ' } else { 'UPDATED' }) [$($item.Code)] $(Protect-Email $item.Upn) $(@($item.Changes.Keys) -join ', ')"
            }
            catch {
                $result.Failed++
                Write-SyncLog -Level ERROR "FAILED $($kind.TrimEnd('s').ToLowerInvariant()) [$($item.Code)] $(Protect-Email $item.Upn): $($_.Exception.Message)"
            }
        }
    }

    foreach ($item in $Plan.Licenses) {
        try {
            Add-GraphLicence -UserId $item.UserId -SkuId $item.SkuId -RetryDelaySeconds $RetryDelaySeconds
            $result.Licensed++
            Write-SyncLog "LICENSED [$($item.Code)] $(Protect-Email $item.Upn)"
        }
        catch {
            $result.Failed++
            Write-SyncLog -Level ERROR "FAILED licence [$($item.Code)] $(Protect-Email $item.Upn): $($_.Exception.Message)"
        }
    }

    $result.NewAccounts = $newAccounts.ToArray()
    return $result
}
