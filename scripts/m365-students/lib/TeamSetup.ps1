#Requires -Version 7.2
# Plans and makes the Teams the student sync expects: one per eligible class
# and one for the academic year, identified by mailNickname. Creates missing
# Teams, turns groups into Teams, fixes display names, adds missing owners.
# Never deletes a Team, removes an owner or changes membership.

Set-StrictMode -Version Latest

function Get-UserIdByAddress {
    [OutputType([hashtable])]
    param([Parameter(Mandatory)][hashtable]$State)

    $map = @{}
    foreach ($u in @($State.Users)) {
        foreach ($a in @($u.Upn, $u.Mail) + @($u.Addresses)) {
            if ($a -and -not $map.ContainsKey($a.ToLowerInvariant())) { $map[$a.ToLowerInvariant()] = $u.Id }
        }
    }
    return $map
}

function New-TeamSetupPlan {
    <#
      Pure. The year group is a Team only if YearTeamIsTeam; class groups
      are always Teams. Returns Creates, EnableTeams, Renames, OwnerAdds and Issues
      (NO OWNER, OWNER NOT FOUND, NICKNAME TAKEN, PAST TEAM).
    #>
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][hashtable]$Desired,
        [Parameter(Mandatory)][hashtable]$State,
        [Parameter(Mandatory)][hashtable]$Config
    )

    $userIds = Get-UserIdByAddress -State $State
    $groupsByNickname = @{}
    foreach ($g in @($State.Groups)) { if ($g.Nickname) { $groupsByNickname[$g.Nickname.ToLowerInvariant()] = $g } }
    $userNicknames = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($u in @($State.Users)) { if ($u.MailNickname) { [void]$userNicknames.Add($u.MailNickname) } }
    $defaultOwners = @($Config['DefaultTeamOwners'] | Where-Object { $_ } | ForEach-Object { ([string]$_).Trim().ToLowerInvariant() })

    $wanted = [System.Collections.Generic.List[object]]::new()
    $wanted.Add([pscustomobject]@{
            Nickname    = $Desired.YearTeam.Nickname
            DisplayName = $Desired.YearTeam.DisplayName
            Description = "All Year 3+ students, $($Desired.AcademicYear.Code). Managed by scripts/m365-students."
            OwnerEmails = $defaultOwners
            IsTeam      = [bool]$Config.YearTeamIsTeam
        })
    foreach ($c in ($Desired.Classes.Values | Where-Object Eligibility -eq 'Eligible' | Sort-Object DisplayName)) {
        $wanted.Add([pscustomobject]@{
                Nickname    = $c.Nickname
                DisplayName = $c.DisplayName
                Description = "Class $($c.Name), $($Desired.AcademicYear.Code). Managed by scripts/m365-students."
                OwnerEmails = @(@($c.TeacherEmail) + $defaultOwners | Where-Object { $_ } | Select-Object -Unique)
                IsTeam      = $true
            })
    }

    $creates = [System.Collections.Generic.List[object]]::new()
    $enable = [System.Collections.Generic.List[object]]::new()
    $renames = [System.Collections.Generic.List[object]]::new()
    $ownerAdds = [System.Collections.Generic.List[object]]::new()
    $issues = [System.Collections.Generic.List[object]]::new()

    foreach ($w in $wanted) {
        $ownerIds = [System.Collections.Generic.List[string]]::new()
        foreach ($email in $w.OwnerEmails) {
            if ($userIds.ContainsKey($email)) { if (-not $ownerIds.Contains($userIds[$email])) { $ownerIds.Add($userIds[$email]) } }
            else { $issues.Add([pscustomobject]@{ Type = 'OWNER NOT FOUND'; Team = $w.DisplayName; Detail = "no Microsoft 365 user with address $email" }) }
        }

        if (-not $groupsByNickname.ContainsKey($w.Nickname)) {
            if ($userNicknames.Contains($w.Nickname)) {
                $issues.Add([pscustomobject]@{ Type = 'NICKNAME TAKEN'; Team = $w.DisplayName; Detail = "a user already has the mail nickname $($w.Nickname)" })
                continue
            }
            if ($ownerIds.Count -eq 0) {
                $issues.Add([pscustomobject]@{ Type = 'NO OWNER'; Team = $w.DisplayName; Detail = 'a Team needs an owner: set the class teacher in the portal or DefaultTeamOwners in config.psd1' })
                continue
            }
            $creates.Add([pscustomobject]@{
                    Nickname = $w.Nickname; DisplayName = $w.DisplayName; Description = $w.Description; OwnerIds = $ownerIds.ToArray(); IsTeam = $w.IsTeam
                })
            continue
        }

        $group = $groupsByNickname[$w.Nickname]
        if ($w.IsTeam -and -not $group.IsTeam) { $enable.Add([pscustomobject]@{ GroupId = $group.Id; Nickname = $w.Nickname; DisplayName = $group.DisplayName }) }
        if ($group.DisplayName -cne $w.DisplayName) {
            $renames.Add([pscustomobject]@{ GroupId = $group.Id; Nickname = $w.Nickname; From = $group.DisplayName; To = $w.DisplayName })
        }
        foreach ($id in $ownerIds) {
            if (@($group.OwnerIds) -notcontains $id) {
                $email = @($w.OwnerEmails | Where-Object { $userIds[$_] -eq $id })[0]
                $ownerAdds.Add([pscustomobject]@{ GroupId = $group.Id; Nickname = $w.Nickname; Team = $w.DisplayName; UserId = $id; Email = $email })
            }
        }
    }

    $wantedNicknames = @($wanted | ForEach-Object Nickname)
    $managedPattern = Get-ManagedTeamPattern -Config $Config
    foreach ($g in ($State.Groups | Where-Object { $_.Nickname -match $managedPattern } | Sort-Object DisplayName)) {
        if ($wantedNicknames -notcontains $g.Nickname) {
            $issues.Add([pscustomobject]@{ Type = 'PAST TEAM'; Team = $g.DisplayName; Detail = "not a current class or year ($($g.Nickname)); archive it in Teams when you're ready (never changed by these scripts)" })
        }
    }

    return @{
        Creates     = $creates.ToArray()
        EnableTeams = $enable.ToArray()
        Renames     = $renames.ToArray()
        OwnerAdds   = $ownerAdds.ToArray()
        Issues      = $issues.ToArray()
    }
}

function Invoke-TeamSetupPlan {
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][hashtable]$Plan,
        [int]$RetryDelaySeconds = 10
    )

    $result = @{ Created = 0; Enabled = 0; Renamed = 0; OwnersAdded = 0; Failed = 0 }
    # A new group can take a while to be ready for a Team: retry, per the Graph docs.
    $makeTeam = {
        param([string]$GroupId)
        Invoke-WithRetry -Attempts 3 -DelaySeconds $RetryDelaySeconds -Action {
            Invoke-StudentGraph -Method PUT -Uri "v1.0/groups/$GroupId/team" -Body @{}
        } | Out-Null
    }

    foreach ($item in $Plan.Creates) {
        try {
            $binds = @($item.OwnerIds | ForEach-Object { "https://graph.microsoft.com/v1.0/users/$_" })
            $group = Invoke-StudentGraph -Method POST -Uri 'v1.0/groups' -Body @{
                displayName               = $item.DisplayName
                mailNickname              = $item.Nickname
                description               = $item.Description
                visibility                = 'Private'
                groupTypes                = @('Unified')
                mailEnabled               = $true
                securityEnabled           = $false
                resourceBehaviorOptions   = @('WelcomeEmailDisabled')
                'owners@odata.bind'       = $binds
                'members@odata.bind'      = $binds
            }
            if ($item.IsTeam) { & $makeTeam ([string]$group['id']) }
            $result.Created++
            Write-SyncLog "CREATED $(if ($item.IsTeam) { 'TEAM' } else { 'GROUP' }) $($item.Nickname)"
        }
        catch {
            $result.Failed++
            Write-SyncLog -Level ERROR "FAILED create Team $($item.Nickname): $($_.Exception.Message). Re-run to retry (an existing group is turned into a Team)."
        }
    }
    foreach ($item in $Plan.EnableTeams) {
        try { & $makeTeam $item.GroupId; $result.Enabled++; Write-SyncLog "ENABLED TEAM $($item.Nickname)" }
        catch { $result.Failed++; Write-SyncLog -Level ERROR "FAILED enable Team $($item.Nickname): $($_.Exception.Message)" }
    }
    foreach ($item in $Plan.Renames) {
        try {
            Invoke-StudentGraph -Method PATCH -Uri "v1.0/groups/$($item.GroupId)" -Body @{ displayName = $item.To } | Out-Null
            $result.Renamed++
            Write-SyncLog "RENAMED TEAM $($item.Nickname)"
        }
        catch { $result.Failed++; Write-SyncLog -Level ERROR "FAILED rename Team $($item.Nickname): $($_.Exception.Message)" }
    }
    foreach ($item in $Plan.OwnerAdds) {
        try {
            Invoke-StudentGraph -Method POST -Uri "v1.0/groups/$($item.GroupId)/owners/`$ref" `
                -Body @{ '@odata.id' = "https://graph.microsoft.com/v1.0/users/$($item.UserId)" } | Out-Null
            $result.OwnersAdded++
            Write-SyncLog "OWNER ADDED $($item.Nickname) $(Protect-Email $item.Email)"
        }
        catch { $result.Failed++; Write-SyncLog -Level ERROR "FAILED add owner to $($item.Nickname): $($_.Exception.Message)" }
    }
    return $result
}
