#Requires -Version 7.2
# Turns tenant state into the inventory CSV rows and a count summary.

Set-StrictMode -Version Latest

function Get-InventoryRows {
    <# Pure: turns tenant state into the three CSV row sets and a count summary. #>
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][hashtable]$State,
        [Parameter(Mandatory)][hashtable]$Config
    )

    $skuNames = @{}
    foreach ($s in $State.Skus) { $skuNames[$s.SkuId] = $s.PartNumber }
    $groupsByUser = @{}
    foreach ($g in $State.Groups) {
        foreach ($id in @($g.MemberIds)) {
            if (-not $groupsByUser.ContainsKey($id)) { $groupsByUser[$id] = [System.Collections.Generic.List[string]]::new() }
            $groupsByUser[$id].Add($g.DisplayName)
        }
    }

    $users = foreach ($u in ($State.Users | Sort-Object Upn)) {
        $row = [ordered]@{
            Upn          = $u.Upn
            GivenName    = $u.GivenName
            Surname      = $u.Surname
            DisplayName  = $u.DisplayName
            Enabled      = $u.Enabled
            EmployeeId   = $u.EmployeeId
            EmployeeType = $u.EmployeeType
            Department   = $u.Department
            Synced       = $u.Synced
            Licences     = (@($u.SkuIds | ForEach-Object { if ($skuNames.ContainsKey($_)) { $skuNames[$_] } else { $_ } }) | Sort-Object) -join '; '
            Groups       = if ($groupsByUser.ContainsKey($u.Id)) { (@($groupsByUser[$u.Id]) | Sort-Object) -join '; ' } else { '' }
        }
        foreach ($n in 1..15) { $row["CustomAttribute$n"] = $u.Attributes["CustomAttribute$n"] }
        [pscustomobject]$row
    }

    $managedPattern = Get-ManagedTeamPattern -Config $Config
    $upnById = @{}
    foreach ($u in $State.Users) { $upnById[$u.Id] = $u.Upn }
    $teams = foreach ($g in ($State.Groups | Sort-Object DisplayName)) {
        [pscustomobject][ordered]@{
            Id          = $g.Id
            DisplayName = $g.DisplayName
            Nickname    = $g.Nickname
            IsTeam      = $g.IsTeam
            Managed     = $g.Nickname -match $managedPattern
            Owners      = @($g.OwnerIds).Count
            OwnerUpns   = (@($g.OwnerIds | ForEach-Object { if ($upnById.ContainsKey($_)) { $upnById[$_] } else { $_ } }) | Sort-Object) -join '; '
            Members     = @($g.MemberIds).Count
            Description = $g.Description
        }
    }

    $licences = foreach ($s in ($State.Skus | Sort-Object PartNumber)) {
        [pscustomobject][ordered]@{
            PartNumber = $s.PartNumber; SkuId = $s.SkuId; Enabled = $s.Enabled; Consumed = $s.Consumed; Available = $s.Available
        }
    }

    $domain = [string]$Config.Domain
    $firstLast = '^[a-z]+(-[a-z]+)*\.[a-z]+(-[a-z]+)*\d*@' + [regex]::Escape($domain) + '$'
    $summary = [System.Collections.Generic.List[string]]::new()
    $summary.Add("Users:                        $(@($State.Users).Count) (enabled: $(@($State.Users | Where-Object Enabled).Count))")
    $summary.Add("  on @${domain}:              $(@($State.Users | Where-Object { $_.Upn.EndsWith("@$domain") }).Count)")
    $summary.Add("  username like first.last:   $(@($State.Users | Where-Object { $_.Upn -match $firstLast }).Count)")
    $summary.Add("  with an Employee ID:        $(@($State.Users | Where-Object EmployeeId).Count)")
    $summary.Add("  synced from on-premises AD: $(@($State.Users | Where-Object Synced).Count)")
    $summary.Add("  without a licence:          $(@($State.Users | Where-Object { @($_.SkuIds).Count -eq 0 }).Count)")
    foreach ($group in ($State.Users | Where-Object { $_.Attributes.CustomAttribute1 } |
            Group-Object { $_.Attributes.CustomAttribute1 } | Sort-Object Name)) {
        $summary.Add("  with CustomAttribute1 = $($group.Name): $($group.Count)")
    }
    foreach ($group in ($State.Users | Where-Object EmployeeType | Group-Object EmployeeType | Sort-Object Name)) {
        $summary.Add("  with Employee type = $($group.Name): $($group.Count)")
    }
    $summary.Add("Microsoft 365 groups:         $(@($State.Groups).Count) (Teams: $(@($State.Groups | Where-Object IsTeam).Count), named like this year's or another year's student Teams: $(@($teams | Where-Object Managed).Count))")
    foreach ($s in $licences) {
        $summary.Add("Licence $($s.PartNumber): $($s.Consumed) of $($s.Enabled) used, $($s.Available) available")
    }

    return @{ Users = @($users); Teams = @($teams); Licences = @($licences); Summary = $summary.ToArray() }
}
