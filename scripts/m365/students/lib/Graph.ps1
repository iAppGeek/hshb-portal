#Requires -Version 7.2
# Microsoft Graph access: sign-in and reading the tenant. Every call goes
# through Invoke-StudentGraph, so tests can replace Microsoft with a fake and
# check which requests were made.

Set-StrictMode -Version Latest

# Reading only. Dry runs and the inventory sign in with these, so they
# cannot change anything even by mistake.
$script:GraphReadScopes = @('User.Read.All', 'GroupMember.Read.All', 'Directory.Read.All')
# -Apply, -ApplyTeamChanges and setup-teams.ps1 -Apply.
$script:GraphWriteScopes = @('User.ReadWrite.All', 'Group.ReadWrite.All', 'Directory.Read.All')

$script:UserSelect = @(
    'id', 'userPrincipalName', 'givenName', 'surname', 'displayName', 'accountEnabled', 'employeeId',
    'employeeType', 'department', 'officeLocation', 'mail', 'mailNickname', 'proxyAddresses', 'usageLocation',
    'onPremisesExtensionAttributes', 'onPremisesSyncEnabled', 'assignedLicenses'
) -join ','
$script:GroupSelect = 'id,displayName,mailNickname,mail,proxyAddresses,resourceProvisioningOptions,description'

function Connect-SyncGraph {
    [OutputType([void])]
    param(
        [switch]$Write,
        [switch]$Device
    )

    if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication)) {
        throw 'Microsoft.Graph.Authentication module not installed. Run: Install-Module Microsoft.Graph.Authentication -Scope CurrentUser'
    }
    Import-Module Microsoft.Graph.Authentication -ErrorAction Stop

    $scopes = if ($Write) { $script:GraphWriteScopes } else { $script:GraphReadScopes }
    $context = Get-MgContext
    if ($context -and @($scopes | Where-Object { @($context.Scopes) -notcontains $_ }).Count -eq 0) {
        # Already signed in with enough permission. A read-only run reuses a
        # write session: the dry run code only ever sends GET requests.
        return
    }
    if ($context) { Disconnect-MgGraph | Out-Null }

    if ($env:M365_ADMIN_UPN) { Write-Host "Sign in as $env:M365_ADMIN_UPN when prompted." }
    $params = @{ Scopes = $scopes; NoWelcome = $true }
    if ($Device) { $params.UseDeviceCode = $true }
    Connect-MgGraph @params
}

function Get-SignedInUpn {
    <# The account signed in to Microsoft Graph, lowercased, or '' if unknown. #>
    [OutputType([string])]
    param()

    $context = Get-MgContext
    if ($null -eq $context -or $null -eq $context.PSObject.Properties['Account']) { return '' }
    return ([string]$context.Account).Trim().ToLowerInvariant()
}

function Invoke-StudentGraph {
    [OutputType([object])]
    param(
        [ValidateSet('GET', 'POST', 'PATCH', 'PUT', 'DELETE')][string]$Method = 'GET',
        [Parameter(Mandatory)][string]$Uri,
        [AllowNull()][object]$Body
    )

    $params = @{ Method = $Method; Uri = $Uri; OutputType = 'HashTable'; ErrorAction = 'Stop' }
    if ($null -ne $Body) {
        $params.Body = $Body | ConvertTo-Json -Depth 10 -Compress
        $params.ContentType = 'application/json'
    }
    return Invoke-MgGraphRequest @params
}

function Get-GraphCollection {
    <# GET every page of a collection and return the items. #>
    [OutputType([object[]])]
    param([Parameter(Mandatory)][string]$Uri)

    $items = [System.Collections.Generic.List[object]]::new()
    $next = $Uri
    while ($next) {
        $page = Invoke-StudentGraph -Method GET -Uri $next
        foreach ($item in @($page['value'])) { if ($null -ne $item) { $items.Add($item) } }
        $next = if ($page.ContainsKey('@odata.nextLink')) { [string]$page['@odata.nextLink'] } else { $null }
    }
    return , $items.ToArray()
}

function ConvertTo-CleanValue {
    [OutputType([string])]
    param([AllowNull()][object]$Value)

    if ($null -eq $Value) { return '' }
    return ([string]$Value).Trim()
}

function ConvertFrom-GraphUser {
    <# Plain object with Exchange-style attribute names (CustomAttribute1..15). #>
    [OutputType([pscustomobject])]
    param([Parameter(Mandatory)][System.Collections.IDictionary]$User)

    $extensions = $User['onPremisesExtensionAttributes']
    $attributes = @{}
    foreach ($n in 1..15) {
        $value = if ($extensions -is [System.Collections.IDictionary]) { $extensions["extensionAttribute$n"] } else { $null }
        $attributes["CustomAttribute$n"] = ConvertTo-CleanValue $value
    }
    $addresses = @(@($User['proxyAddresses']) | Where-Object { [string]$_ -match '^smtp:' } |
            ForEach-Object { ([string]$_ -replace '^smtp:', '').Trim().ToLowerInvariant() })

    return [pscustomobject]@{
        Id            = [string]$User['id']
        Upn           = (ConvertTo-CleanValue $User['userPrincipalName']).ToLowerInvariant()
        GivenName     = ConvertTo-CleanValue $User['givenName']
        Surname       = ConvertTo-CleanValue $User['surname']
        DisplayName   = ConvertTo-CleanValue $User['displayName']
        Enabled       = [bool]$User['accountEnabled']
        EmployeeId    = ConvertTo-CleanValue $User['employeeId']
        EmployeeType  = ConvertTo-CleanValue $User['employeeType']
        Department    = ConvertTo-CleanValue $User['department']
        Office        = ConvertTo-CleanValue $User['officeLocation']
        Mail          = (ConvertTo-CleanValue $User['mail']).ToLowerInvariant()
        MailNickname  = (ConvertTo-CleanValue $User['mailNickname']).ToLowerInvariant()
        Addresses     = $addresses
        UsageLocation = ConvertTo-CleanValue $User['usageLocation']
        Synced        = [bool]$User['onPremisesSyncEnabled']
        SkuIds        = @(@($User['assignedLicenses']) | Where-Object { $_ } | ForEach-Object { [string]$_['skuId'] })
        Attributes    = $attributes
    }
}

function Get-GraphUsers {
    [OutputType([object[]])]
    param()

    $raw = Get-GraphCollection -Uri "v1.0/users?`$select=$($script:UserSelect)&`$top=999"
    $users = foreach ($u in $raw) {
        ConvertFrom-GraphUser -User $u
    }
    return , @($users)
}

function Get-GraphUnifiedGroups {
    <# Every Microsoft 365 group, with member and owner ids. One request per group per list. #>
    [OutputType([object[]])]
    param()

    $filter = [uri]::EscapeDataString("groupTypes/any(c:c eq 'Unified')")
    $raw = Get-GraphCollection -Uri "v1.0/groups?`$filter=$filter&`$select=$($script:GroupSelect)&`$top=999"
    $groups = foreach ($g in $raw) {
        $id = [string]$g['id']
        $members = Get-GraphCollection -Uri "v1.0/groups/$id/members?`$select=id&`$top=999"
        $owners = Get-GraphCollection -Uri "v1.0/groups/$id/owners?`$select=id&`$top=999"
        [pscustomobject]@{
            Id          = $id
            DisplayName = ConvertTo-CleanValue $g['displayName']
            Nickname    = (ConvertTo-CleanValue $g['mailNickname']).ToLowerInvariant()
            Mail        = (ConvertTo-CleanValue $g['mail']).ToLowerInvariant()
            Addresses   = @(@($g['proxyAddresses']) | Where-Object { [string]$_ -match '^smtp:' } |
                    ForEach-Object { ([string]$_ -replace '^smtp:', '').Trim().ToLowerInvariant() })
            IsTeam      = @($g['resourceProvisioningOptions']) -contains 'Team'
            Description = ConvertTo-CleanValue $g['description']
            MemberIds   = @($members | ForEach-Object { [string]$_['id'] })
            OwnerIds    = @($owners | ForEach-Object { [string]$_['id'] })
        }
    }
    return , @($groups)
}

function Get-GraphSkus {
    [OutputType([object[]])]
    param()

    $raw = Get-GraphCollection -Uri 'v1.0/subscribedSkus'
    $skus = foreach ($s in $raw) {
        $prepaid = $s['prepaidUnits']
        $enabled = if ($prepaid -is [System.Collections.IDictionary]) { [int]$prepaid['enabled'] } else { 0 }
        [pscustomobject]@{
            SkuId         = [string]$s['skuId']
            PartNumber    = [string]$s['skuPartNumber']
            Enabled       = $enabled
            Consumed      = [int]$s['consumedUnits']
            Available     = $enabled - [int]$s['consumedUnits']
        }
    }
    return , @($skus)
}

function Get-GraphTenantState {
    [OutputType([hashtable])]
    param()

    return @{
        Users  = Get-GraphUsers
        Groups = Get-GraphUnifiedGroups
        Skus   = Get-GraphSkus
    }
}
