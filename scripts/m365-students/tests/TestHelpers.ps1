# Shared test helpers: config and data factories, and a fake Microsoft Graph
# tenant that records every request. Dot-source from BeforeAll.

$script:Root = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command Invoke-MgGraphRequest -ErrorAction SilentlyContinue)) {
    # Stand-ins so Pester can mock them without the Graph module installed.
    function global:Invoke-MgGraphRequest { param($Method, $Uri, $Body, $OutputType, $ContentType) throw 'Not mocked' }
    function global:Get-MgContext { return $null }
    function global:Connect-MgGraph { param($Scopes, [switch]$NoWelcome, [switch]$UseDeviceCode) }
    function global:Disconnect-MgGraph { }
}

function New-TestConfig {
    param([hashtable]$Overrides = @{})
    $config = @{
        Domain                = 'school.example'
        LicenseSkuPartNumber  = 'STUDENT_SKU'
        UsageLocation         = 'GB'
        Tag                   = 'Student'
        MembershipAttribute   = 'CustomAttribute4'
        EligibleYearGroups    = @('3', '4', '5', '6', 'GCSE', 'A Level')
        IgnoredYearGroups     = @('pre-school', '1', '2', 'All', 'Test')
        ClassTeamNameFormat   = '{0} {1}'
        YearTeamNameFormat    = 'Students {0}'
        TeamNicknamePrefix    = 'stu-'
        DefaultTeamOwners     = @('head@school.example')
        LegacyStudentTeamIds  = @()
        MaxTeamRemovalPercent = 20
        MaxDataAgeHours       = 24
        LogRetentionDays      = 30
    }
    foreach ($k in $Overrides.Keys) { $config[$k] = $Overrides[$k] }
    return $config
}

# --- Fake Graph -------------------------------------------------------------

function New-GraphUser {
    <# A user as Graph returns it (hashtable). Attributes use Exchange names. #>
    param(
        [string]$Upn,
        [string]$Given,
        [string]$Surname,
        [string]$EmployeeId,
        [hashtable]$Attributes = @{},
        [bool]$Enabled = $true,
        [string[]]$SkuIds = @(),
        [string]$Department,
        [string]$UsageLocation = 'GB',
        [string]$Id = ([guid]::NewGuid().ToString())
    )
    $extensions = @{}
    foreach ($n in 1..15) { $extensions["extensionAttribute$n"] = $null }
    foreach ($k in $Attributes.Keys) { $extensions[$k -replace '^CustomAttribute', 'extensionAttribute'] = $Attributes[$k] }
    return @{
        id                            = $Id
        userPrincipalName             = $Upn
        givenName                     = $Given
        surname                       = $Surname
        displayName                   = (@($Given, $Surname) | Where-Object { $_ }) -join ' '
        accountEnabled                = $Enabled
        employeeId                    = $EmployeeId
        employeeType                  = $null
        department                    = $Department
        mail                          = $Upn
        mailNickname                  = ($Upn -split '@')[0]
        proxyAddresses                = @("SMTP:$Upn")
        usageLocation                 = $UsageLocation
        onPremisesExtensionAttributes = $extensions
        onPremisesSyncEnabled         = $null
        assignedLicenses              = @($SkuIds | ForEach-Object { @{ skuId = $_ } })
    }
}

function New-GraphGroup {
    param(
        [string]$Name,
        [string]$Nickname,
        [string[]]$MemberIds = @(),
        [string[]]$OwnerIds = @(),
        [bool]$IsTeam = $true,
        [string]$Id = ([guid]::NewGuid().ToString())
    )
    return @{
        id                          = $Id
        displayName                 = $Name
        mailNickname                = $Nickname
        mail                        = "$Nickname@school.example"
        proxyAddresses              = @("SMTP:$Nickname@school.example")
        resourceProvisioningOptions = if ($IsTeam) { @('Team') } else { @() }
        description                 = ''
        members                     = [System.Collections.Generic.List[string]]@($MemberIds)
        owners                      = [System.Collections.Generic.List[string]]@($OwnerIds)
    }
}

function New-FakeTenant {
    param(
        [object[]]$Users = @(),
        [object[]]$Groups = @(),
        [object[]]$Skus = @(@{ skuId = 'sku-student'; skuPartNumber = 'STUDENT_SKU'; prepaidUnits = @{ enabled = 500 }; consumedUnits = 10 }),
        # Split collections into pages of this size to exercise paging.
        [int]$PageSize = 1000
    )
    return @{
        Users    = [System.Collections.Generic.List[object]]@($Users)
        Groups   = [System.Collections.Generic.List[object]]@($Groups)
        Skus     = @($Skus)
        PageSize = $PageSize
        Calls    = [System.Collections.Generic.List[object]]::new()
    }
}

function Get-FakePage {
    param([hashtable]$Tenant, [object[]]$Items, [string]$Uri)
    $skip = 0
    if ($Uri -match '[?&]skip=(\d+)') { $skip = [int]$Matches[1] }
    $page = @($Items | Select-Object -Skip $skip -First $Tenant.PageSize)
    $result = @{ value = $page }
    if ($skip + $Tenant.PageSize -lt $Items.Count) {
        $base = $Uri -replace '[?&]skip=\d+', ''
        $sep = if ($base.Contains('?')) { '&' } else { '?' }
        $result['@odata.nextLink'] = "$base${sep}skip=$($skip + $Tenant.PageSize)"
    }
    return $result
}

function Invoke-FakeGraph {
    <# Routes a request to the fake tenant and records it. #>
    param([hashtable]$Tenant, [string]$Method, [string]$Uri, [object]$Body)

    $parsed = if ($Body) { $Body | ConvertFrom-Json -AsHashtable } else { $null }
    $Tenant.Calls.Add([pscustomobject]@{ Method = $Method; Uri = $Uri; Body = $parsed })
    $path = ($Uri -replace '^https://graph\.microsoft\.com/', '') -replace '\?.*$', ''

    switch -Regex ($path) {
        '^v1\.0/users$' {
            if ($Method -eq 'GET') { return Get-FakePage $Tenant @($Tenant.Users) $Uri }
            if ($Method -eq 'POST') {
                $upn = [string]$parsed['userPrincipalName']
                if (@($Tenant.Users | Where-Object { $_['userPrincipalName'] -ieq $upn }).Count) {
                    throw "Another object with the same value for property userPrincipalName already exists."
                }
                $user = @{}
                foreach ($k in $parsed.Keys) { $user[$k] = $parsed[$k] }
                $user['id'] = [guid]::NewGuid().ToString()
                $user['mail'] = $upn
                $user['proxyAddresses'] = @("SMTP:$upn")
                $user['assignedLicenses'] = @()
                $ext = @{}
                foreach ($n in 1..15) { $ext["extensionAttribute$n"] = $null }
                if ($parsed['onPremisesExtensionAttributes']) {
                    foreach ($k in $parsed['onPremisesExtensionAttributes'].Keys) { $ext[$k] = $parsed['onPremisesExtensionAttributes'][$k] }
                }
                $user['onPremisesExtensionAttributes'] = $ext
                $Tenant.Users.Add($user)
                return $user
            }
        }
        '^v1\.0/users/([^/]+)$' {
            $id = $Matches[1]
            $user = @($Tenant.Users | Where-Object { $_['id'] -eq $id })[0]
            if ($Method -eq 'PATCH') {
                foreach ($k in $parsed.Keys) {
                    if ($k -eq 'onPremisesExtensionAttributes') {
                        foreach ($e in $parsed[$k].Keys) { $user[$k][$e] = $parsed[$k][$e] }
                    }
                    else { $user[$k] = $parsed[$k] }
                }
                return $null
            }
        }
        '^v1\.0/users/([^/]+)/assignLicense$' {
            $id = $Matches[1]
            $user = @($Tenant.Users | Where-Object { $_['id'] -eq $id })[0]
            $user['assignedLicenses'] = @($user['assignedLicenses']) + @($parsed['addLicenses'] | ForEach-Object { @{ skuId = $_['skuId'] } })
            return $user
        }
        '^v1\.0/groups$' {
            if ($Method -eq 'GET') {
                $view = @($Tenant.Groups | ForEach-Object {
                        $g = @{}; foreach ($k in $_.Keys) { if ($k -notin 'members', 'owners') { $g[$k] = $_[$k] } }; $g
                    })
                return Get-FakePage $Tenant $view $Uri
            }
            if ($Method -eq 'POST') {
                $group = New-GraphGroup -Name $parsed['displayName'] -Nickname $parsed['mailNickname'] -IsTeam $false `
                    -OwnerIds @($parsed['owners@odata.bind'] | ForEach-Object { ($_ -split '/')[-1] })
                $group['description'] = $parsed['description']
                $Tenant.Groups.Add($group)
                return @{ id = $group['id'] }
            }
        }
        '^v1\.0/groups/([^/]+)$' {
            $group = @($Tenant.Groups | Where-Object { $_['id'] -eq $Matches[1] })[0]
            if ($Method -eq 'PATCH') { foreach ($k in $parsed.Keys) { $group[$k] = $parsed[$k] }; return $null }
        }
        '^v1\.0/groups/([^/]+)/team$' {
            $group = @($Tenant.Groups | Where-Object { $_['id'] -eq $Matches[1] })[0]
            if ($Method -eq 'PUT') { $group['resourceProvisioningOptions'] = @('Team'); return @{ id = $group['id'] } }
        }
        '^v1\.0/groups/([^/]+)/(members|owners)$' {
            $group = @($Tenant.Groups | Where-Object { $_['id'] -eq $Matches[1] })[0]
            $ids = @($group[$Matches[2]] | ForEach-Object { @{ id = $_ } })
            if ($Method -eq 'GET') { return Get-FakePage $Tenant $ids $Uri }
        }
        '^v1\.0/groups/([^/]+)/(members|owners)/\$ref$' {
            $group = @($Tenant.Groups | Where-Object { $_['id'] -eq $Matches[1] })[0]
            $list = $Matches[2]
            if ($Method -eq 'POST') { $group[$list].Add(($parsed['@odata.id'] -split '/')[-1]); return $null }
        }
        '^v1\.0/groups/([^/]+)/members/([^/]+)/\$ref$' {
            $group = @($Tenant.Groups | Where-Object { $_['id'] -eq $Matches[1] })[0]
            if ($Method -eq 'DELETE') { [void]$group['members'].Remove($Matches[2]); return $null }
        }
        '^v1\.0/subscribedSkus$' {
            if ($Method -eq 'GET') { return @{ value = @($Tenant.Skus) } }
        }
    }
    throw "Fake Graph: no route for $Method $Uri"
}

function Get-WriteCalls {
    param([hashtable]$Tenant)
    return @($Tenant.Calls | Where-Object { $_.Method -ne 'GET' })
}
