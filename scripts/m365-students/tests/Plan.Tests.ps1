#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
# Run: pwsh -c "Invoke-Pester ./tests"

BeforeAll {
    . (Join-Path $PSScriptRoot 'TestHelpers.ps1')
    . (Join-Path $script:Root 'lib/StudentConfig.ps1')
    . (Join-Path $script:Root 'lib/StudentData.ps1')
    . (Join-Path $script:Root 'lib/Graph.ps1')
    . (Join-Path $script:Root 'lib/StudentPlan.ps1')

    function Get-Plan {
        param([object[]]$Students, [object[]]$Users = @(), [object[]]$Groups = (New-CurrentTeams), [hashtable]$Config = (New-TestConfig),
            [string[]]$InactiveCodes = @(), [string]$OnlyCode, [object[]]$Skus)
        $desired = Get-TestDesired -Students $Students -Config $Config -InactiveCodes $InactiveCodes
        $stateArgs = @{ Users = $Users; Groups = $Groups }
        if ($PSBoundParameters.ContainsKey('Skus')) { $stateArgs.Skus = $Skus }
        $state = New-TestState @stateArgs
        return New-StudentPlan -Desired $desired -State $state -Config $Config -OnlyCode $OnlyCode
    }

    function Get-IssueTypes { param([hashtable]$Plan) return @($Plan.Issues | ForEach-Object Type) }

    function Get-TakenAddressSetForTest {
        $state = New-TestState -Users @(
            (New-GraphUser -Upn 'alice.smith@school.example' -Given 'Alice' -Surname 'Smith'),
            (New-GraphUser -Upn 'a.smith@school.example' -Given 'A' -Surname 'Smith')
        ) -Groups @(New-GraphGroup -Name 'Year 3' -Nickname 'year3')
        # An alias on another account also blocks a username.
        $state.Users[1].Addresses = @('a.smith@school.example', 'alice.smith2@school.example')
        return Get-TakenAddressSet -State $state
    }
}

Describe 'Usernames' {
    It 'turns "<First> <Last>" into <Expected>' -ForEach @(
        @{ First = 'Alice'; Last = 'Smith'; Expected = 'alice.smith' }
        @{ First = 'Zoë'; Last = "O'Brien"; Expected = 'zoe.obrien' }
        @{ First = 'Mary Jane'; Last = 'Smith-Jones'; Expected = 'mary-jane.smith-jones' }
        @{ First = 'Ahmet'; Last = 'Yılmaz'; Expected = 'ahmet.yilmaz' }
        @{ First = 'Łucja'; Last = 'Strauß'; Expected = 'lucja.strauss' }
        @{ First = '  José '; Last = 'García  López'; Expected = 'jose.garcia-lopez' }
        @{ First = '李'; Last = 'Smith'; Expected = '' }
    ) {
        Get-StudentUpnBase -FirstName $First -LastName $Last | Should -Be $Expected
    }

    It 'adds a number when the username, an address or a group nickname is taken' {
        $taken = Get-TakenAddressSetForTest
        (New-StudentUpn -Base 'alice.smith' -Domain 'school.example' -Taken $taken).Upn | Should -Be 'alice.smith3@school.example'
        (New-StudentUpn -Base 'alice.smith' -Domain 'school.example' -Taken $taken).Upn | Should -Be 'alice.smith4@school.example'
        (New-StudentUpn -Base 'year3' -Domain 'school.example' -Taken $taken).Upn | Should -Be 'year32@school.example'
    }

    It 'never gives two new students the same username' {
        $plan = Get-Plan -Students @((New-TestStudent 'S1' 'Alice' 'Smith'), (New-TestStudent 'S2' 'Alice' 'Smith')) `
            -Users @(New-GraphUser -Upn 'alice.smith@school.example' -Given 'Alice' -Surname 'Smith' -Attributes @{ CustomAttribute1 = 'Teacher' })
        @($plan.Creates | ForEach-Object Upn) | Should -Be @('alice.smith2@school.example', 'alice.smith3@school.example')
    }
}

Describe 'Matching students to accounts' {
    It 'matches on Employee ID = student code, ignoring case, and plans nothing when in sync' {
        $account = New-StudentAccount 'alice.smith@school.example' 'Alice' 'Smith' 's001'
        $account.employeeId = 'S001'
        $groups = New-CurrentTeams -Members @{ Year = @($account.id); Y3 = @($account.id) }
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith') -Users @($account) -Groups $groups
        $plan.Creates + $plan.Links + $plan.Updates + $plan.Licenses + $plan.TeamChanges | Should -BeNullOrEmpty
        $plan.Issues | Should -BeNullOrEmpty
        $plan.Rows[0].Status | Should -Be 'OK'
        $plan.Rows[0].YearGroups | Should -Be 'Year 3'
        $plan.Rows[0].ActualTeams | Should -Be 'HSHB Student 2026-2027; Year 3 - 2026-2027'
    }

    It 'plans an UPDATE for changed names, never the username, and ignores Department' {
        $account = New-StudentAccount 'alice.smith@school.example' 'Alise' 'Smith' 'S001' -Department 'Year 2'
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith-Jones') -Users @($account)
        $plan.Updates.Count | Should -Be 1
        $changes = $plan.Updates[0].Changes
        @($changes.Keys) | Should -Be @('givenName', 'surname', 'displayName')
        $changes['surname'].To | Should -Be 'Smith-Jones'
        Get-IssueTypes $plan | Should -Contain 'NAME/UPN MISMATCH'
    }

    It 'LINKs exactly one unlinked account with the same name and stamps the link fields' {
        $account = New-GraphUser -Upn 'asmith@school.example' -Given 'Alice' -Surname 'Smith' -UsageLocation ''
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith') -Users @($account)
        $plan.Creates | Should -BeNullOrEmpty
        $plan.Links.Count | Should -Be 1
        $changes = $plan.Links[0].Changes
        $changes['employeeId'].To | Should -Be 'S001'
        $changes['CustomAttribute1'].To | Should -Be 'Student'
        $changes['CustomAttribute4'].To | Should -Be 'Student'
        $changes['usageLocation'].To | Should -Be 'GB'
    }

    It 'matches a name with accents or different case' {
        $account = New-GraphUser -Upn 'zoe.obrien@school.example' -Given 'ZOE' -Surname 'OBrien'
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Zoë' "O'Brien") -Users @($account)
        $plan.Links.Count | Should -Be 1
    }

    It 'never links an account that already has a tag or an Employee ID' {
        $teacher = New-GraphUser -Upn 'alice.smith@school.example' -Given 'Alice' -Surname 'Smith' -Attributes @{ CustomAttribute1 = 'Teacher' }
        $staff = New-GraphUser -Upn 'asmith@school.example' -Given 'Alice' -Surname 'Smith' -EmployeeId 'E77'
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith') -Users @($teacher, $staff)
        $plan.Links | Should -BeNullOrEmpty
        $plan.Creates.Count | Should -Be 1
        $plan.Creates[0].Upn | Should -Be 'alice.smith2@school.example'
    }

    It 'reports AMBIGUOUS when several unlinked accounts share the name' {
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith') -Users @(
            (New-GraphUser -Upn 'asmith@school.example' -Given 'Alice' -Surname 'Smith'),
            (New-GraphUser -Upn 'alice.s@school.example' -Given 'Alice' -Surname 'Smith'))
        $plan.Links + $plan.Creates + $plan.TeamChanges | Should -BeNullOrEmpty
        Get-IssueTypes $plan | Should -Be @('AMBIGUOUS')
        $plan.Rows[0].Status | Should -Be 'AMBIGUOUS'
    }

    It "prefers the candidate in last year's Team" {
        $old = New-GraphUser -Upn 'asmith@school.example' -Given 'Alice' -Surname 'Smith'
        $other = New-GraphUser -Upn 'alice.s@school.example' -Given 'Alice' -Surname 'Smith'
        $legacy = New-GraphGroup -Name 'Students 2025-26' -Nickname 'students2526' -MemberIds @($old.id)
        $config = New-TestConfig @{ LegacyStudentTeamIds = @($legacy.id) }
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith') -Users @($old, $other) -Groups (@(New-CurrentTeams) + $legacy) -Config $config
        $plan.Links.Count | Should -Be 1
        $plan.Links[0].Upn | Should -Be 'asmith@school.example'
    }

    It 'never links one account to two students with the same name' {
        $account = New-GraphUser -Upn 'asmith@school.example' -Given 'Alice' -Surname 'Smith'
        $plan = Get-Plan -Students @((New-TestStudent 'S001' 'Alice' 'Smith'), (New-TestStudent 'S002' 'Alice' 'Smith')) -Users @($account)
        $plan.Links | Should -BeNullOrEmpty
        @(Get-IssueTypes $plan) | Should -Be @('AMBIGUOUS', 'AMBIGUOUS')
    }

    It 'reports a CONFLICT when the Employee ID belongs to an account with another tag' {
        $teacher = New-GraphUser -Upn 'bob@school.example' -Given 'Bob' -Surname 'Jones' -EmployeeId 'S001' -Attributes @{ CustomAttribute1 = 'Teacher' }
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith') -Users @($teacher)
        $plan.Updates + $plan.Creates | Should -BeNullOrEmpty
        Get-IssueTypes $plan | Should -Contain 'CONFLICT'
    }

    It 'reports a duplicate Employee ID and changes neither account' {
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith') -Users @(
            (New-StudentAccount 'alice.smith@school.example' 'Alice' 'Smith' 'S001'),
            (New-StudentAccount 'alice.smith2@school.example' 'Alice' 'Smith' 'S001'))
        $plan.Updates + $plan.Creates + $plan.TeamChanges | Should -BeNullOrEmpty
        Get-IssueTypes $plan | Should -Contain 'DUPLICATE EMPLOYEE ID'
        Get-IssueTypes $plan | Should -Not -Contain 'ORPHAN'
    }

    It 'plans no account changes for an account synced from on-premises AD' {
        $account = New-GraphUser -Upn 'asmith@school.example' -Given 'Alice' -Surname 'Smith'
        $account.onPremisesSyncEnabled = $true
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith') -Users @($account)
        $plan.Links + $plan.Creates | Should -BeNullOrEmpty
        Get-IssueTypes $plan | Should -Contain 'SYNCED ACCOUNT'
    }
}

Describe 'Creating accounts' {
    It 'creates firstname.lastname with the link fields, usage location and licence' {
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Zoë' "O'Brien" @('Y4', 'Gcse'))
        $plan.Creates.Count | Should -Be 1
        $c = $plan.Creates[0]
        $c.Upn | Should -Be 'zoe.obrien@school.example'
        $c.MailNickname | Should -Be 'zoe.obrien'
        $c.DisplayName | Should -Be "Zoë O'Brien"
        $c.PSObject.Properties.Name | Should -Not -Contain 'Department'
        $c.Attributes['CustomAttribute1'] | Should -Be 'Student'
        $c.Attributes['CustomAttribute4'] | Should -Be 'Student'
        $c.UsageLocation | Should -Be 'GB'
        $c.SkuId | Should -Be 'sku-student'
        $plan.Rows[0].Status | Should -Be 'CREATE'
    }

    It 'queues Team adds for the new account without a user id yet' {
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith' @('Y3'))
        @($plan.TeamChanges | ForEach-Object Team) | Should -Be @('HSHB Student 2026-2027', 'Year 3 - 2026-2027')
        $plan.TeamChanges | ForEach-Object { $_.UserId | Should -BeNullOrEmpty; $_.Action | Should -Be 'ADD' }
    }

    It 'reports a name that cannot make a username' {
        $plan = Get-Plan -Students @(New-TestStudent 'S001' '李' '王')
        $plan.Creates | Should -BeNullOrEmpty
        Get-IssueTypes $plan | Should -Contain 'INVALID NAME'
    }

    It 'warns when no licence is configured and assigns none' {
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith') -Config (New-TestConfig @{ LicenseSkuPartNumber = '' })
        $plan.Creates[0].SkuId | Should -BeNullOrEmpty
        Get-IssueTypes $plan | Should -Contain 'LICENCE NOT SET'
    }

    It 'reports a configured licence missing from the tenant' {
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith') -Skus @()
        Get-IssueTypes $plan | Should -Contain 'LICENCE NOT FOUND'
    }
}

Describe 'Usernames and email addresses are never changed' {
    It 'no UPDATE or LINK change touches a username, mail or alias field' {
        $students = @(
            (New-TestStudent 'S001' 'Alice' 'Smith-Jones'),
            (New-TestStudent 'S002' 'Bob' 'Jones'),
            (New-TestStudent 'S003' 'Cara' 'Lee')
        )
        $users = @(
            (New-StudentAccount 'alice.smith@school.example' 'Alice' 'Smith' 'S001'),
            (New-GraphUser -Upn 'bj@school.example' -Given 'Bob' -Surname 'Jones'),
            (New-StudentAccount 'cara.lee@school.example' 'Kara' 'Lee' 'S003' -Enabled $false)
        )
        $plan = Get-Plan -Students $students -Users $users
        $fields = @($plan.Updates + $plan.Links | ForEach-Object { $_.Changes.Keys })
        $fields.Count | Should -BeGreaterThan 0
        foreach ($field in $fields) { $script:UserWritableFields | Should -Contain $field }
        $fields | Should -Not -Contain 'department'
        $fields | Should -Not -Contain 'userPrincipalName'
        $fields | Should -Not -Contain 'mail'
        $fields | Should -Not -Contain 'mailNickname'
        $fields | Should -Not -Contain 'proxyAddresses'
    }
}

Describe 'Teams' {
    It 'adds a student missing from their class and year Teams' {
        $account = New-StudentAccount 'alice.smith@school.example' 'Alice' 'Smith' 'S001'
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith' @('Y3')) -Users @($account)
        $plan.TeamChanges.Count | Should -Be 2
        $plan.TeamChanges | ForEach-Object { $_.UserId | Should -Be $account.id }
        $plan.TeamChanges[0].ChangeId | Should -Be (Get-TeamChangeId -Action 'ADD' -Nickname 'students-2026-2027' -Code 's001')
    }

    It 'removes a student who moved class, from the old class Team only' {
        $account = New-StudentAccount 'alice.smith@school.example' 'Alice' 'Smith' 'S001' -Department 'Year 4'
        $groups = New-CurrentTeams -Members @{ Year = @($account.id); Y3 = @($account.id) }
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith' @('Y4')) -Users @($account) -Groups $groups -Config (New-TestConfig @{ MaxTeamRemovalPercent = 100 })
        $remove = @($plan.TeamChanges | Where-Object Action -eq 'REMOVE')
        $remove.Count | Should -Be 1
        $remove[0].Team | Should -Be 'Year 3 - 2026-2027'
        @($plan.TeamChanges | Where-Object Action -eq 'ADD' | ForEach-Object Team) | Should -Be @('Year 4 - 2026-2027')
    }

    It 'never removes teachers, owners or other non-student members' {
        $teacher = New-GraphUser -Upn 't3@school.example' -Given 'Tia' -Surname 'Teach' -Attributes @{ CustomAttribute1 = 'Teacher' }
        $other = New-GraphUser -Upn 'helper@school.example' -Given 'Hal' -Surname 'Help'
        $groups = New-CurrentTeams -Members @{ Y3 = @($teacher.id, $other.id); Year = @($teacher.id) }
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith' @('Y4')) -Users @($teacher, $other) -Groups $groups
        @($plan.TeamChanges | Where-Object Action -eq 'REMOVE') | Should -BeNullOrEmpty
    }

    It "never removes leavers (report only) or touches past years' Teams" {
        $leaver = New-StudentAccount 'old.kid@school.example' 'Old' 'Kid' 'S900'
        $current = New-StudentAccount 'alice.smith@school.example' 'Alice' 'Smith' 'S001'
        $past = New-GraphGroup -Name 'Year 3 - 2025-2026' -Nickname 'year3-2025-2026' -MemberIds @($current.id)
        $groups = @(New-CurrentTeams -Members @{ Year = @($leaver.id, $current.id); Y3 = @($leaver.id, $current.id) }) + $past
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith' @('Y3')) -Users @($leaver, $current) -Groups $groups -InactiveCodes @('S900')
        $plan.TeamChanges | Should -BeNullOrEmpty
        Get-IssueTypes $plan | Should -Be @('LEAVER')
    }

    It 'reports a missing Team once, with the number of students waiting' {
        $groups = @(New-CurrentTeams | Where-Object { $_.mailNickname -ne 'year3-2026-2027' })
        $plan = Get-Plan -Students @((New-TestStudent 'S1' 'A' 'B' @('Y3')), (New-TestStudent 'S2' 'C' 'D' @('Y3'))) -Groups $groups
        $missing = @($plan.Issues | Where-Object Type -eq 'MISSING TEAM')
        $missing.Count | Should -Be 1
        $missing[0].Detail | Should -Match 'Year 3 - 2026-2027 \(year3-2026-2027\).*2 student'
        @($plan.TeamChanges | ForEach-Object Team) | Should -Not -Contain 'Year 3 - 2026-2027'
    }

    It 'trips the removal guard above MaxTeamRemovalPercent' {
        $a = New-StudentAccount 'a.b@school.example' 'A' 'B' 'S1'
        $c = New-StudentAccount 'c.d@school.example' 'C' 'D' 'S2'
        $groups = New-CurrentTeams -Members @{ Year = @($a.id, $c.id); Y3 = @($a.id, $c.id) }
        $plan = Get-Plan -Students @((New-TestStudent 'S1' 'A' 'B' @('Y4')), (New-TestStudent 'S2' 'C' 'D' @('Y3'))) -Users @($a, $c) -Groups $groups
        $plan.TeamRemovalCount | Should -Be 1
        $plan.ManagedMembershipCount | Should -Be 4
        $plan.TeamRemovalPercent | Should -Be 25
        $plan.TeamGuardTripped | Should -BeTrue
    }
}

Describe 'Reports' {
    It 'reports leavers, orphans and below-Year-3 accounts without changing them' {
        $users = @(
            (New-StudentAccount 'leaver@school.example' 'Lee' 'Ver' 'S900'),
            (New-StudentAccount 'orphan@school.example' 'Or' 'Phan' 'S999'),
            (New-StudentAccount 'young@school.example' 'Yo' 'Ung' 'S002'),
            (New-GraphUser -Upn 'nocode@school.example' -Given 'No' -Surname 'Code' -Attributes @{ CustomAttribute1 = 'Student' })
        )
        $plan = Get-Plan -Students @((New-TestStudent 'S001' 'Alice' 'Smith'), (New-TestStudent 'S002' 'Yo' 'Ung' @('Y2'))) -Users $users -InactiveCodes @('S900')
        @(Get-IssueTypes $plan | Sort-Object) | Should -Be @('LEAVER', 'NOT ELIGIBLE', 'ORPHAN', 'ORPHAN')
        $plan.Updates + $plan.Links | Should -BeNullOrEmpty
        @($plan.Rows | ForEach-Object Status | Sort-Object) | Should -Be @('CREATE', 'LEAVER', 'NOT ELIGIBLE', 'ORPHAN', 'ORPHAN')
    }

    It 'accepts firstlast and first.last usernames as matching the name' {
        $a = New-StudentAccount 'alicesmith@school.example' 'Alice' 'Smith' 'S001'
        $b = New-StudentAccount 'bob.jones2@school.example' 'Bob' 'Jones' 'S002'
        $c = New-StudentAccount 'cjl@school.example' 'Cara' 'Lee' 'S003'
        $plan = Get-Plan -Students @((New-TestStudent 'S001' 'Alice' 'Smith'), (New-TestStudent 'S002' 'Bob' 'Jones'), (New-TestStudent 'S003' 'Cara' 'Lee')) -Users @($a, $b, $c)
        @($plan.Issues | Where-Object Type -eq 'NAME/UPN MISMATCH' | ForEach-Object Upn) | Should -Be @('cjl@school.example')
    }

    It 'reports a disabled account for an active student' {
        $account = New-StudentAccount 'alice.smith@school.example' 'Alice' 'Smith' 'S001' -Enabled $false
        $plan = Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith') -Users @($account)
        Get-IssueTypes $plan | Should -Contain 'DISABLED'
        $plan.Rows[0].AccountEnabled | Should -BeFalse
    }

    It 'reports students with no code or no class, and unknown year groups, and blocks -Apply for unknown ones' {
        $classes = @(New-TestClasses) + @(@{ id = '70000000-0000-0000-0000-000000000000'; name = 'Year 7'; yearGroup = 'Year 7'; teacherEmail = $null })
        $odd = New-TestStudent 'S3' 'E' 'F' @()
        $odd.classIds = @('70000000-0000-0000-0000-000000000000')
        $desired = Get-TestDesired -Classes $classes -Students @((New-TestStudent '' 'A' 'B' @('Y3')), (New-TestStudent 'S2' 'C' 'D' @()), $odd)
        $plan = New-StudentPlan -Desired $desired -State (New-TestState -Groups (New-CurrentTeams)) -Config (New-TestConfig)
        @(Get-IssueTypes $plan | Sort-Object) | Should -Be @('NO CLASS', 'NO CODE', 'UNKNOWN YEAR GROUP', 'UNKNOWN YEAR GROUP')
        $plan.BlocksApply | Should -BeTrue
        $plan.Creates | Should -BeNullOrEmpty
    }

    It 'does not block -Apply when every year group is known' {
        (Get-Plan -Students @(New-TestStudent 'S001' 'Alice' 'Smith')).BlocksApply | Should -BeFalse
    }
}

Describe '-Only' {
    It 'plans one student and skips account-wide reports' {
        $orphan = New-StudentAccount 'orphan@school.example' 'Or' 'Phan' 'S999'
        $plan = Get-Plan -Students @((New-TestStudent 'S001' 'Alice' 'Smith'), (New-TestStudent 'S002' 'Bob' 'Jones')) -Users @($orphan) -OnlyCode 's002'
        @($plan.Creates | ForEach-Object Code) | Should -Be @('S002')
        Get-IssueTypes $plan | Should -Not -Contain 'ORPHAN'
    }
}
