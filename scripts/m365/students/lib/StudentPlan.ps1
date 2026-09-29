#Requires -Version 7.2
# Compares the students who need an account with Microsoft 365 and works out
# what to change. Pure: no Graph calls, so it is fully testable.
#
# Usernames and email addresses are never changed: only a CREATE sets them.
# UPDATE and LINK may only touch the fields in $script:UserWritableFields.
# Department and class are deliberately not stored on accounts: class
# membership lives in the class Teams.

Set-StrictMode -Version Latest

$script:UserWritableFields = @(
    'givenName', 'surname', 'displayName', 'employeeId', 'officeLocation', 'usageLocation'
) + @(1..15 | ForEach-Object { "CustomAttribute$_" })

$script:SpecialLetters = @{ 'ß' = 'ss'; 'æ' = 'ae'; 'œ' = 'oe'; 'ø' = 'o'; 'ł' = 'l'; 'đ' = 'd'; 'ð' = 'd'; 'þ' = 'th'; 'ı' = 'i' }

function ConvertTo-UpnPart {
    <#
      Lowercase ASCII for a username: accents removed, apostrophes dropped,
      anything else that isn't a letter or digit becomes a hyphen.
      "Zoë O'Brien-Smith" -> "zoe-obrien-smith".
    #>
    [OutputType([string])]
    param([AllowNull()][AllowEmptyString()][string]$Name)

    if ([string]::IsNullOrWhiteSpace($Name)) { return '' }
    $text = $Name.Trim().ToLowerInvariant()
    foreach ($letter in $script:SpecialLetters.Keys) { $text = $text.Replace($letter, $script:SpecialLetters[$letter]) }
    $builder = [System.Text.StringBuilder]::new()
    foreach ($ch in $text.Normalize([Text.NormalizationForm]::FormD).ToCharArray()) {
        if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$builder.Append($ch)
        }
    }
    $text = $builder.ToString() -replace "['’‘``]", ''
    $text = $text -replace '[^a-z0-9]+', '-'
    return $text.Trim('-')
}

function Get-StudentUpnBase {
    <# firstname.lastname, or '' if either part has no usable characters. #>
    [OutputType([string])]
    param([string]$FirstName, [string]$LastName)

    $first = ConvertTo-UpnPart $FirstName
    $last = ConvertTo-UpnPart $LastName
    if (-not $first -or -not $last) { return '' }
    $base = "$first.$last"
    # Leave room for a collision number within the 64-character local part.
    if ($base.Length -gt 60) { $base = $base.Substring(0, 60).TrimEnd('-', '.') }
    return $base
}

function Get-TakenAddressSet {
    <# Every address and mail nickname in use, so a new username can't clash with a user or group. #>
    [OutputType([hashtable])]
    param([Parameter(Mandatory)][hashtable]$State)

    $addresses = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $nicknames = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($u in @($State.Users)) {
        foreach ($a in @($u.Upn, $u.Mail) + @($u.Addresses)) { if ($a) { [void]$addresses.Add($a) } }
        if ($u.MailNickname) { [void]$nicknames.Add($u.MailNickname) }
    }
    foreach ($g in @($State.Groups)) {
        foreach ($a in @($g.Mail) + @($g.Addresses)) { if ($a) { [void]$addresses.Add($a) } }
        if ($g.Nickname) { [void]$nicknames.Add($g.Nickname) }
    }
    return @{ Addresses = $addresses; Nicknames = $nicknames }
}

function New-StudentUpn {
    <# Allocates firstname.lastname, then firstname.lastname2, 3, ... and marks it taken. #>
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory)][string]$Base,
        [Parameter(Mandatory)][string]$Domain,
        [Parameter(Mandatory)][hashtable]$Taken
    )

    for ($n = 1; ; $n++) {
        $local = if ($n -eq 1) { $Base } else { "$Base$n" }
        $upn = "$local@$Domain"
        if (-not $Taken.Addresses.Contains($upn) -and -not $Taken.Nicknames.Contains($local)) {
            [void]$Taken.Addresses.Add($upn)
            [void]$Taken.Nicknames.Add($local)
            return [pscustomobject]@{ Upn = $upn; MailNickname = $local }
        }
    }
}

function Get-TeamChangeId {
    <# Stable id for a Team change, so an approved row can be matched to a later plan. #>
    [OutputType([string])]
    param([string]$Action, [string]$Nickname, [string]$Code)

    $text = "$($Action.ToUpperInvariant())|$($Nickname.ToLowerInvariant())|$(Get-CodeKey $Code)"
    $hash = [System.Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($text))
    return ([Convert]::ToHexString($hash)).Substring(0, 16).ToLowerInvariant()
}

function Get-SignInBlockId {
    <# Stable id for a proposed sign-in block (one per account). #>
    [OutputType([string])]
    param([Parameter(Mandatory)][string]$UserId)

    $hash = [System.Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes("BLOCK|$($UserId.ToLowerInvariant())"))
    return ([Convert]::ToHexString($hash)).Substring(0, 16).ToLowerInvariant()
}

function Get-PersonNameKeys {
    <# Keys used to match a person's name: first|last and the whole name. #>
    [OutputType([string[]])]
    param([string]$FirstName, [string]$LastName, [string]$DisplayName)

    $keys = @(
        $(if ($FirstName -and $LastName) { (ConvertTo-UpnPart $FirstName) + '|' + (ConvertTo-UpnPart $LastName) })
        $(if ($DisplayName) { ConvertTo-UpnPart $DisplayName })
    )
    return @($keys | Where-Object { $_ -and $_ -ne '|' } | Select-Object -Unique)
}

function Get-UserFieldValue {
    [OutputType([string])]
    param([Parameter(Mandatory)][object]$User, [Parameter(Mandatory)][string]$Field)

    switch -Regex ($Field) {
        '^givenName$' { return $User.GivenName }
        '^surname$' { return $User.Surname }
        '^displayName$' { return $User.DisplayName }
        '^employeeId$' { return $User.EmployeeId }
        '^officeLocation$' { return $User.Office }
        '^usageLocation$' { return $User.UsageLocation }
        '^CustomAttribute\d+$' { return $User.Attributes[$Field] }
    }
    throw "Unknown user field '$Field'."
}

function New-StudentPlan {
    <#
      Returns:
        Creates, Links, Updates, Licenses : account changes (-Apply)
        TeamChanges : Team ADD/REMOVE rows (-ApplyTeamChanges, after review)
        SignInBlocks: accounts that could have sign-in blocked (-ApplySignInBlocks,
                      after review): enabled leavers, orphans, below-Year-3
                      and unlinked student accounts
        Issues      : report-only items { Type, Code, Name, Upn, Detail }
        Rows        : one reconciliation row per student / managed account
        BlocksApply : true if unknown year groups make eligibility uncertain
        and the Team removal guard figures.
    #>
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][hashtable]$Desired,
        [Parameter(Mandatory)][hashtable]$State,
        [Parameter(Mandatory)][hashtable]$Config,
        # Plan for one student only (by code); account-wide reports are skipped.
        [string]$OnlyCode
    )

    $tag = [string]$Config.Tag
    $memberAttribute = [string]$Config.MembershipAttribute
    $domain = [string]$Config.Domain
    $onlyKey = Get-CodeKey $OnlyCode

    $creates = [System.Collections.Generic.List[object]]::new()
    $links = [System.Collections.Generic.List[object]]::new()
    $updates = [System.Collections.Generic.List[object]]::new()
    $licenses = [System.Collections.Generic.List[object]]::new()
    $teamChanges = [System.Collections.Generic.List[object]]::new()
    $signInBlocks = [System.Collections.Generic.List[object]]::new()
    $issues = [System.Collections.Generic.List[object]]::new()
    $rows = [System.Collections.Generic.List[object]]::new()
    $addIssue = {
        param([string]$Type, [string]$Code, [string]$Name, [string]$Upn, [string]$Detail)
        $issues.Add([pscustomobject]@{ Type = $Type; Code = $Code; Name = $Name; Upn = $Upn; Detail = $Detail })
    }

    # --- Indexes over Microsoft 365 ------------------------------------------
    $usersById = @{}
    $byEmployeeId = @{}
    $byName = @{}
    $byOffice = @{}
    foreach ($u in @($State.Users)) {
        $usersById[$u.Id] = $u
        $key = Get-CodeKey $u.EmployeeId
        if ($key) {
            if (-not $byEmployeeId.ContainsKey($key)) { $byEmployeeId[$key] = [System.Collections.Generic.List[object]]::new() }
            $byEmployeeId[$key].Add($u)
        }
        # Office- and name-match candidates: accounts nothing has claimed yet.
        if (-not $key -and -not $u.Attributes.CustomAttribute1) {
            $officeKey = Get-CodeKey $u.Office
            if ($officeKey) {
                if (-not $byOffice.ContainsKey($officeKey)) { $byOffice[$officeKey] = [System.Collections.Generic.List[object]]::new() }
                $byOffice[$officeKey].Add($u)
            }
            $nameKeys = @(
                $(if ($u.GivenName -and $u.Surname) { (ConvertTo-UpnPart $u.GivenName) + '|' + (ConvertTo-UpnPart $u.Surname) })
                $(if ($u.DisplayName) { ConvertTo-UpnPart $u.DisplayName })
            ) | Where-Object { $_ } | Select-Object -Unique
            foreach ($k in $nameKeys) {
                if (-not $byName.ContainsKey($k)) { $byName[$k] = [System.Collections.Generic.List[object]]::new() }
                $byName[$k].Add($u)
            }
        }
    }
    $groupsByNickname = @{}
    foreach ($g in @($State.Groups)) { if ($g.Nickname) { $groupsByNickname[$g.Nickname.ToLowerInvariant()] = $g } }
    $legacyMembers = [System.Collections.Generic.HashSet[string]]::new()
    foreach ($id in @($Config['LegacyStudentTeamIds'])) {
        $g = @($State.Groups | Where-Object Id -eq $id)
        if ($g.Count -eq 0) {
            if ($id) { & $addIssue 'LEGACY TEAM NOT FOUND' '' '' '' "LegacyStudentTeamIds contains $id, which is not a Microsoft 365 group" }
            continue
        }
        foreach ($m in @($g[0].MemberIds)) { [void]$legacyMembers.Add($m) }
    }
    $groupNamesByUser = @{}
    foreach ($g in @($State.Groups)) {
        foreach ($m in @($g.MemberIds)) {
            if (-not $groupNamesByUser.ContainsKey($m)) { $groupNamesByUser[$m] = [System.Collections.Generic.List[string]]::new() }
            $groupNamesByUser[$m].Add($g.DisplayName)
        }
    }
    $teamName = {
        param([string]$Nickname)
        if ($groupsByNickname.ContainsKey($Nickname)) { return $groupsByNickname[$Nickname].DisplayName }
        if ($Nickname -eq $Desired.YearTeam.Nickname) { return $Desired.YearTeam.DisplayName }
        $class = @($Desired.Classes.Values | Where-Object Nickname -eq $Nickname)
        if ($class.Count) { return $class[0].DisplayName }
        return $Nickname
    }

    # --- Licence ---------------------------------------------------------------
    $skuId = $null
    if ([string]::IsNullOrWhiteSpace([string]$Config['LicenseSkuPartNumber'])) {
        & $addIssue 'LICENCE NOT SET' '' '' '' 'LicenseSkuPartNumber is empty in config.psd1: new accounts get no licence and licences are not checked'
    }
    else {
        $sku = @($State.Skus | Where-Object { $_.PartNumber -ieq [string]$Config.LicenseSkuPartNumber })
        if ($sku.Count -eq 0) {
            & $addIssue 'LICENCE NOT FOUND' '' '' '' "Licence $($Config.LicenseSkuPartNumber) is not in this tenant (see inventory-licences-*.csv)"
        }
        else { $skuId = $sku[0].SkuId }
    }
    # A student account has the student licence or was in last year's student
    # Team. Untagged staff accounts (e.g. admin) have neither.
    $looksLikeStudent = {
        param([object]$Account)
        return [bool](($skuId -and @($Account.SkuIds) -contains $skuId) -or $legacyMembers.Contains($Account.Id))
    }
    $unconfirmed = {
        param([object]$Student, [object]$Account, [string]$By)
        [void]$pendingIds.Add($Account.Id)
        return [pscustomobject]@{
            Student = $Student; Kind = 'UNCONFIRMED'; User = $Account
            Detail = "matched by $By to $($Account.Upn), which has no student licence and isn't in last year's student Team: set its Employee ID to link it, or set its CustomAttribute1 (e.g. Staff) if it isn't this student's"
        }
    }

    # --- Pass 1: find each student's account ---------------------------------
    # Accounts waiting on a decision (AMBIGUOUS) aren't reported as unlinked.
    $pendingIds = [System.Collections.Generic.HashSet[string]]::new()
    $students = @($Desired.Students.Values | Where-Object { -not $onlyKey -or (Get-CodeKey $_.Code) -eq $onlyKey })
    $resolutions = foreach ($s in $students) {
        $key = Get-CodeKey $s.Code
        $matched = @(if ($byEmployeeId.ContainsKey($key)) { $byEmployeeId[$key] })
        if ($matched.Count -gt 1) {
            [pscustomobject]@{ Student = $s; Kind = 'DUPLICATE'; User = $null; Detail = "$($matched.Count) accounts have Employee ID $($s.Code)" }
            continue
        }
        if ($matched.Count -eq 1) {
            $u = $matched[0]
            $currentTag = $u.Attributes.CustomAttribute1
            if ($currentTag -and $currentTag -ine $tag) {
                [pscustomobject]@{ Student = $s; Kind = 'CONFLICT'; User = $u; Detail = "the account with this Employee ID has CustomAttribute1 = $currentTag" }
            }
            elseif ($u.Synced) {
                [pscustomobject]@{ Student = $s; Kind = 'SYNCED'; User = $u; Detail = 'account is synced from on-premises AD; change it there' }
            }
            else { [pscustomobject]@{ Student = $s; Kind = 'MATCHED'; User = $u; Detail = '' } }
            continue
        }
        # Next: an unlinked account whose Office holds the student code.
        $byCode = @(if ($byOffice.ContainsKey($key)) { $byOffice[$key] })
        if ($byCode.Count -gt 1) {
            foreach ($c in $byCode) { [void]$pendingIds.Add($c.Id) }
            [pscustomobject]@{ Student = $s; Kind = 'AMBIGUOUS'; User = $null; Detail = "$($byCode.Count) unlinked accounts have Office = $($s.Code): $((@($byCode | ForEach-Object Upn) | Sort-Object) -join ', ')" }
            continue
        }
        if ($byCode.Count -eq 1) {
            if ($byCode[0].Synced) {
                [pscustomobject]@{ Student = $s; Kind = 'SYNCED'; User = $byCode[0]; Detail = 'matching account is synced from on-premises AD; change it there' }
            }
            elseif (-not (& $looksLikeStudent $byCode[0])) { & $unconfirmed $s $byCode[0] 'Office' }
            else { [pscustomobject]@{ Student = $s; Kind = 'LINK'; User = $byCode[0]; Detail = 'matched by Office' } }
            continue
        }
        $candidates = [System.Collections.Generic.List[object]]::new()
        foreach ($k in @(((ConvertTo-UpnPart $s.FirstName) + '|' + (ConvertTo-UpnPart $s.LastName)), (ConvertTo-UpnPart $s.DisplayName))) {
            if ($byName.ContainsKey($k)) { foreach ($u in $byName[$k]) { if (-not $candidates.Contains($u)) { $candidates.Add($u) } } }
        }
        if ($candidates.Count -gt 1) {
            $preferred = @($candidates | Where-Object { $legacyMembers.Contains($_.Id) })
            if ($preferred.Count -ne 1) { $preferred = @($candidates | Where-Object { & $looksLikeStudent $_ }) }
            if ($preferred.Count -eq 1) { $candidates = [System.Collections.Generic.List[object]]@($preferred) }
        }
        if ($candidates.Count -eq 1) {
            if ($candidates[0].Synced) {
                [pscustomobject]@{ Student = $s; Kind = 'SYNCED'; User = $candidates[0]; Detail = 'matching account is synced from on-premises AD; change it there' }
            }
            elseif (-not (& $looksLikeStudent $candidates[0])) { & $unconfirmed $s $candidates[0] 'name' }
            else { [pscustomobject]@{ Student = $s; Kind = 'LINK'; User = $candidates[0]; Detail = '' } }
        }
        elseif ($candidates.Count -gt 1) {
            foreach ($c in $candidates) { [void]$pendingIds.Add($c.Id) }
            [pscustomobject]@{ Student = $s; Kind = 'AMBIGUOUS'; User = $null; Detail = "$($candidates.Count) unlinked accounts have this name: $((@($candidates | ForEach-Object Upn) | Sort-Object) -join ', ')" }
        }
        else { [pscustomobject]@{ Student = $s; Kind = 'CREATE'; User = $null; Detail = '' } }
    }
    $resolutions = @($resolutions)

    # Two students (e.g. same name) must never be linked to the same account.
    $claims = @{}
    foreach ($r in $resolutions) {
        if ($r.Kind -eq 'LINK') { $claims[$r.User.Id] = 1 + [int]$claims[$r.User.Id] }
    }
    foreach ($r in $resolutions) {
        if ($r.Kind -eq 'LINK' -and $claims[$r.User.Id] -gt 1) {
            [void]$pendingIds.Add($r.User.Id)
            $r.Detail = "account $($r.User.Upn) matches more than one student by name"
            $r.Kind = 'AMBIGUOUS'
            $r.User = $null
        }
    }

    # --- Pass 2: plan changes per student -------------------------------------
    $taken = Get-TakenAddressSet -State $State
    $missingTeams = [ordered]@{}
    $claimedIds = [System.Collections.Generic.HashSet[string]]::new()

    foreach ($r in $resolutions) {
        $s = $r.Student
        $expected = @($s.TeamNicknames | ForEach-Object { & $teamName $_ })
        $notes = [System.Collections.Generic.List[string]]::new()
        $u = $r.User
        if ($u) { [void]$claimedIds.Add($u.Id) }
        $status = $r.Kind

        switch ($r.Kind) {
            { $_ -in 'DUPLICATE', 'CONFLICT', 'SYNCED', 'AMBIGUOUS', 'UNCONFIRMED' } {
                $type = @{ DUPLICATE = 'DUPLICATE EMPLOYEE ID'; CONFLICT = 'CONFLICT'; SYNCED = 'SYNCED ACCOUNT'; AMBIGUOUS = 'AMBIGUOUS'; UNCONFIRMED = 'UNCONFIRMED MATCH' }[$r.Kind]
                & $addIssue $type $s.Code $s.DisplayName $(if ($u) { $u.Upn } else { '' }) $r.Detail
                $status = $type
                $notes.Add($r.Detail)
            }
            'CREATE' {
                $base = Get-StudentUpnBase -FirstName $s.FirstName -LastName $s.LastName
                if (-not $base) {
                    & $addIssue 'INVALID NAME' $s.Code $s.DisplayName '' 'name has no letters or digits usable in a username'
                    $status = 'INVALID NAME'
                    break
                }
                $allocated = New-StudentUpn -Base $base -Domain $domain -Taken $taken
                $attributes = [ordered]@{ CustomAttribute1 = $tag }
                $attributes[$memberAttribute] = $tag
                $creates.Add([pscustomobject]@{
                        Code          = $s.Code
                        StudentId     = $s.Id
                        FirstName     = $s.FirstName
                        LastName      = $s.LastName
                        DisplayName   = $s.DisplayName
                        Upn           = $allocated.Upn
                        MailNickname  = $allocated.MailNickname
                        UsageLocation = [string]$Config.UsageLocation
                        Attributes    = $attributes
                        SkuId         = $skuId
                    })
                $u = [pscustomobject]@{ Id = $null; Upn = $allocated.Upn; GivenName = ''; Surname = ''; Enabled = $true }
            }
            { $_ -in 'MATCHED', 'LINK' } {
                $wanted = [ordered]@{
                    givenName = $s.FirstName; surname = $s.LastName; displayName = $s.DisplayName
                    employeeId = $s.Code; officeLocation = $s.Code; CustomAttribute1 = $tag
                }
                $wanted[$memberAttribute] = $tag
                if (-not $u.UsageLocation) { $wanted['usageLocation'] = [string]$Config.UsageLocation }
                $changes = [ordered]@{}
                foreach ($field in $wanted.Keys) {
                    $from = Get-UserFieldValue -User $u -Field $field
                    if ($from -cne $wanted[$field]) { $changes[$field] = @{ From = $from; To = $wanted[$field] } }
                }
                $item = [pscustomobject]@{ UserId = $u.Id; Upn = $u.Upn; Code = $s.Code; DisplayName = $s.DisplayName; Changes = $changes; MatchedBy = $r.Detail }
                if ($r.Kind -eq 'LINK') { $links.Add($item) }
                elseif ($changes.Count -gt 0) { $updates.Add($item); $status = 'UPDATE' }
                else { $status = 'OK' }

                if (-not $u.Enabled) {
                    & $addIssue 'DISABLED' $s.Code $s.DisplayName $u.Upn 'sign-in is blocked for an active student'
                    $notes.Add('sign-in blocked')
                }
                $local = ($u.Upn -split '@')[0] -replace '\d+$', ''
                $base = Get-StudentUpnBase -FirstName $s.FirstName -LastName $s.LastName
                # firstlast and first.last (and first-last) all count as matching the name.
                if ($base -and ($local -replace '[.-]', '') -ne ($base -replace '[.-]', '')) {
                    & $addIssue 'NAME/UPN MISMATCH' $s.Code $s.DisplayName $u.Upn "username doesn't match $base (not changed automatically)"
                    $notes.Add('username does not match name')
                }
                if ($skuId -and @($u.SkuIds) -notcontains $skuId) {
                    $licenses.Add([pscustomobject]@{ UserId = $u.Id; Upn = $u.Upn; Code = $s.Code; DisplayName = $s.DisplayName; SkuId = $skuId })
                    $notes.Add('licence missing')
                }
            }
        }

        # Team membership, for students with (or about to get) an account.
        if ($r.Kind -in 'CREATE', 'MATCHED', 'LINK' -and $status -ne 'INVALID NAME') {
            foreach ($nickname in $s.TeamNicknames) {
                if (-not $groupsByNickname.ContainsKey($nickname)) {
                    if (-not $missingTeams.Contains($nickname)) { $missingTeams[$nickname] = 0 }
                    $missingTeams[$nickname]++
                    continue
                }
                $group = $groupsByNickname[$nickname]
                if ($u.Id -and @($group.MemberIds) -contains $u.Id) { continue }
                $teamChanges.Add([pscustomobject]@{
                        ChangeId     = Get-TeamChangeId -Action 'ADD' -Nickname $nickname -Code $s.Code
                        Action       = 'ADD'
                        GroupId      = $group.Id
                        TeamNickname = $nickname
                        Team         = $group.DisplayName
                        UserId       = $u.Id
                        StudentCode  = $s.Code
                        StudentName  = $s.DisplayName
                        Reason       = "$(if ($nickname -eq $Desired.YearTeam.Nickname) { "Year 3+ student in $($Desired.AcademicYear.Code)" } else { 'in this class in the portal' })$(if (-not $u.Id) { ' (new account)' })"
                    })
                $notes.Add("to add to $($group.DisplayName)")
            }
        }

        $actual = if ($u -and $u.Id -and $groupNamesByUser.ContainsKey($u.Id)) { (@($groupNamesByUser[$u.Id]) | Sort-Object) -join '; ' } else { '' }
        $rows.Add([pscustomobject][ordered]@{
                Status           = $status
                StudentCode      = $s.Code
                DbFirstName      = $s.FirstName
                DbLastName       = $s.LastName
                YearGroups       = $s.YearGroupLabel
                Upn              = if ($u) { $u.Upn } else { '' }
                AccountFirstName = if ($u) { $u.GivenName } else { '' }
                AccountSurname   = if ($u) { $u.Surname } else { '' }
                AccountEnabled   = if ($u -and $u.Id) { $u.Enabled } else { '' }
                AccountOffice    = if ($u -and $u.Id) { $u.Office } else { '' }
                ExpectedTeams    = $expected -join '; '
                ActualTeams      = $actual
                Issues           = $notes -join '; '
            })
    }

    foreach ($nickname in $missingTeams.Keys) {
        & $addIssue 'MISSING TEAM' '' '' '' "$(& $teamName $nickname) ($nickname) doesn't exist yet; $($missingTeams[$nickname]) student(s) wait for it. Run setup-teams.ps1"
    }

    # --- Team removals: only managed students, only this year's managed Teams --
    $currentNicknames = @($Desired.YearTeam.Nickname) + @($Desired.Classes.Values | Where-Object Eligibility -eq 'Eligible' | ForEach-Object Nickname)
    $managedMemberships = 0
    $removals = 0
    foreach ($nickname in $currentNicknames) {
        if (-not $groupsByNickname.ContainsKey($nickname)) { continue }
        $group = $groupsByNickname[$nickname]
        foreach ($memberId in @($group.MemberIds)) {
            $member = $usersById[$memberId]
            if ($null -eq $member -or $member.Attributes.CustomAttribute1 -ine $tag) { continue } # teachers, owners, others
            $key = Get-CodeKey $member.EmployeeId
            if ($onlyKey -and $key -ne $onlyKey) { continue }
            $managedMemberships++
            if (-not $key -or -not $Desired.Students.Contains($key)) { continue } # leavers etc.: report only
            $student = $Desired.Students[$key]
            if (@($student.TeamNicknames) -contains $nickname) { continue }
            $removals++
            $teamChanges.Add([pscustomobject]@{
                    ChangeId     = Get-TeamChangeId -Action 'REMOVE' -Nickname $nickname -Code $student.Code
                    Action       = 'REMOVE'
                    GroupId      = $group.Id
                    TeamNickname = $nickname
                    Team         = $group.DisplayName
                    UserId       = $member.Id
                    StudentCode  = $student.Code
                    StudentName  = $student.DisplayName
                    Reason       = 'no longer in this class in the portal'
                })
        }
    }

    # --- Account-wide reports (skipped for -Only) ----------------------------
    if (-not $onlyKey) {
        foreach ($s in @($Desired.NoCode)) {
            & $addIssue 'NO CODE' '' $s.DisplayName '' 'Year 3+ student has no student code: add one in the portal'
            $rows.Add([pscustomobject][ordered]@{ Status = 'NO CODE'; StudentCode = ''; DbFirstName = $s.FirstName; DbLastName = $s.LastName; YearGroups = ''; Upn = ''; AccountFirstName = ''; AccountSurname = ''; AccountEnabled = ''; AccountOffice = ''; ExpectedTeams = ''; ActualTeams = ''; Issues = 'add a student code in the portal' })
        }
        foreach ($s in @($Desired.NoClass)) {
            & $addIssue 'NO CLASS' $s.Code $s.DisplayName '' 'active student with no current class'
        }
        foreach ($value in @($Desired.UnknownYearGroups)) {
            & $addIssue 'UNKNOWN YEAR GROUP' '' '' '' "year group '$value' is in neither EligibleYearGroups nor IgnoredYearGroups in config.psd1"
        }
        foreach ($s in @($Desired.Undetermined)) {
            & $addIssue 'UNKNOWN YEAR GROUP' $s.Code $s.DisplayName '' 'only in classes with an unknown year group'
        }
        $undeterminedCodes = @($Desired.Undetermined | ForEach-Object { Get-CodeKey $_.Code })
        # An active student's account (e.g. no class yet) is reported but
        # never offered for blocking.
        $isActiveCode = {
            param([string]$Key)
            return [bool]$Key -and ($Desired.NoClassCodes.Contains($Key) -or $Desired.SkippedCodes.Contains($Key))
        }
        $activeDetail = {
            param([string]$Key)
            if ($Desired.NoClassCodes.Contains($Key)) { return 'student is active but has no current class: check their enrolment' }
            return 'student is active but left out of the data (missing first or last name): fix the name in the portal'
        }
        $addAccountReport = {
            param([object]$Account, [string]$Type, [string]$Detail, [bool]$ActiveStudent = $false)
            & $addIssue $Type $Account.EmployeeId $Account.DisplayName $Account.Upn $Detail
            $blockable = [bool]$Account.Enabled -and -not $ActiveStudent
            $rows.Add([pscustomobject][ordered]@{
                    Status = $Type; StudentCode = $Account.EmployeeId; DbFirstName = ''; DbLastName = ''; YearGroups = ''; Upn = $Account.Upn
                    AccountFirstName = $Account.GivenName; AccountSurname = $Account.Surname; AccountEnabled = $Account.Enabled; AccountOffice = $Account.Office; ExpectedTeams = ''
                    ActualTeams = if ($groupNamesByUser.ContainsKey($Account.Id)) { (@($groupNamesByUser[$Account.Id]) | Sort-Object) -join '; ' } else { '' }
                    Issues = "$Detail ($(if ($ActiveStudent) { 'active student: not offered for blocking' } elseif ($blockable) { 'sign-in can be blocked after review' } else { 'sign-in already blocked' }))"
                })
            if ($blockable) {
                $signInBlocks.Add([pscustomobject]@{
                        ChangeId = Get-SignInBlockId -UserId $Account.Id; UserId = $Account.Id; Upn = $Account.Upn
                        AccountName = $Account.DisplayName; StudentCode = $Account.EmployeeId; Reason = "$Type - $Detail"
                    })
            }
        }
        foreach ($u in @($State.Users | Where-Object { $_.Attributes.CustomAttribute1 -ieq $tag })) {
            if ($claimedIds.Contains($u.Id)) { continue }
            $key = Get-CodeKey $u.EmployeeId
            if ($key -and $Desired.Students.Contains($key)) { continue } # reported above (e.g. duplicate)
            if (& $isActiveCode $key) {
                & $addAccountReport $u 'ACTIVE, NOT IN SYNC' (& $activeDetail $key) $true
                continue
            }
            $type, $detail = if ($key -and $Desired.InactiveCodes.Contains($key)) { 'LEAVER', 'student is no longer active in the portal' }
            elseif ($key -and $Desired.NotEligibleCodes.Contains($key)) { 'NOT ELIGIBLE', 'student is below Year 3 (not in an eligible year group)' }
            elseif ($key -and $undeterminedCodes -contains $key) { 'UNKNOWN YEAR GROUP', 'student is only in classes with an unknown year group' }
            else { 'ORPHAN', $(if ($key) { 'Employee ID matches no active student' } else { 'tagged Student but has no Employee ID' }) }
            & $addAccountReport $u $type $detail
        }

        # Unlinked student accounts: student licence or in last year's student
        # group, not tagged, not matched to any student, not awaiting a
        # decision. Report only, with the reason they aren't linked.
        $people = @{}
        $addPeople = {
            param([object[]]$List, [string]$Kind)
            foreach ($p in $List) {
                foreach ($k in Get-PersonNameKeys -FirstName $p.FirstName -LastName $p.LastName -DisplayName $p.DisplayName) {
                    if (-not $people.ContainsKey($k)) { $people[$k] = [System.Collections.Generic.List[string]]::new() }
                    if (-not $people[$k].Contains($Kind)) { $people[$k].Add($Kind) }
                }
            }
        }
        & $addPeople @($Desired.Students.Values) 'YEAR3'
        & $addPeople @($Desired.NoCode) 'YEAR3'
        & $addPeople (@($Desired['NotEligible']) + @($Desired.Undetermined) | Where-Object { $_ }) 'BELOW'
        & $addPeople @($Desired.NoClass) 'NOCLASS'
        & $addPeople @($Desired['Inactive'] | Where-Object { $_ }) 'INACTIVE'

        foreach ($u in @($State.Users)) {
            if ($claimedIds.Contains($u.Id) -or $pendingIds.Contains($u.Id) -or $u.Attributes.CustomAttribute1) { continue }
            $looksLikeStudent = ($skuId -and @($u.SkuIds) -contains $skuId) -or $legacyMembers.Contains($u.Id)
            if (-not $looksLikeStudent) { continue }
            $key = Get-CodeKey $u.EmployeeId
            if ($key -and $Desired.Students.Contains($key)) { continue } # reported above (duplicate / conflict)
            if (-not $key) { $key = Get-CodeKey $u.Office }
            $kinds = @(Get-PersonNameKeys -FirstName $u.GivenName -LastName $u.Surname -DisplayName $u.DisplayName |
                    Where-Object { $people.ContainsKey($_) } | ForEach-Object { $people[$_] } | Select-Object -Unique)
            if (& $isActiveCode $key) {
                & $addAccountReport $u 'UNLINKED: ACTIVE STUDENT' "student code $key is an $(& $activeDetail $key)" $true
                continue
            }
            if ($kinds -contains 'NOCLASS' -and $kinds -notcontains 'YEAR3') {
                & $addAccountReport $u 'UNLINKED: ACTIVE STUDENT' 'name matches an active student with no current class: check their enrolment' $true
                continue
            }
            $type, $detail = if ($key -and $Desired.InactiveCodes.Contains($key)) { 'UNLINKED: INACTIVE STUDENT', "student code $key is a student who is no longer active" }
            elseif ($key -and $Desired.NotEligibleCodes.Contains($key)) { 'UNLINKED: BELOW YEAR 3', "student code $key is a student below Year 3" }
            elseif ($key -and $Desired.Students.Contains($key)) { 'UNLINKED: DUPLICATE', "Office has the code of Year 3+ student $key, who is linked to another account" }
            elseif ($kinds -contains 'YEAR3') { 'UNLINKED: DUPLICATE', 'has the name of a Year 3+ student who is linked to (or will get) another account' }
            elseif ($kinds -contains 'BELOW') { 'UNLINKED: BELOW YEAR 3', 'name matches an active student below Year 3' }
            elseif ($kinds -contains 'INACTIVE') { 'UNLINKED: INACTIVE STUDENT', 'name matches a student who is no longer active' }
            else { 'UNLINKED: NOT IN DATABASE', 'no student in the portal has this name' }
            & $addAccountReport $u $type $detail
        }
    }

    $max = [double]$Config.MaxTeamRemovalPercent
    $removalPercent = if ($managedMemberships -gt 0) { 100.0 * $removals / $managedMemberships } else { 0 }

    return @{
        Creates                = $creates.ToArray()
        Links                  = $links.ToArray()
        Updates                = $updates.ToArray()
        Licenses               = $licenses.ToArray()
        TeamChanges            = $teamChanges.ToArray()
        SignInBlocks           = $signInBlocks.ToArray()
        Issues                 = $issues.ToArray()
        Rows                   = $rows.ToArray()
        SkuId                  = $skuId
        BlocksApply            = (@($Desired.UnknownYearGroups).Count + @($Desired.Undetermined).Count) -gt 0
        ManagedMembershipCount = $managedMemberships
        TeamRemovalCount       = $removals
        TeamRemovalPercent     = $removalPercent
        TeamGuardTripped       = $removalPercent -gt $max
    }
}
