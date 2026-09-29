#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
# Run: pwsh -c "Invoke-Pester ./tests"

BeforeAll {
    . (Join-Path $PSScriptRoot 'TestHelpers.ps1')
    . (Join-Path $script:Root '../shared/Common.ps1')
    . (Join-Path $script:Root 'lib/StudentConfig.ps1')
    . (Join-Path $script:Root 'lib/StudentData.ps1')
    . (Join-Path $script:Root 'lib/Graph.ps1')
    . (Join-Path $script:Root 'lib/Apply.ps1')
    . (Join-Path $script:Root 'lib/TeamSetup.ps1')
    Mock Write-Host { }

    function Get-SetupPlan {
        param([object[]]$Users, [object[]]$Groups = @(), [hashtable]$Config = (New-TestConfig), [string]$CreatorUpn)
        $desired = Get-TestDesired -Students @(New-TestStudent 'S1' 'A' 'B') -Config $Config
        return New-TeamSetupPlan -Desired $desired -State (New-TestState -Users $Users -Groups $Groups) -Config $Config -CreatorUpn $CreatorUpn
    }

    $script:teachers = @(
        (New-GraphUser -Upn 't3@school.example' -Given 'T' -Surname 'Three'),
        (New-GraphUser -Upn 't4@school.example' -Given 'T' -Surname 'Four'),
        (New-GraphUser -Upn 'head@school.example' -Given 'H' -Surname 'Head')
    )
}

Describe 'New-TeamSetupPlan' {
    It 'creates the year Team and one Team per eligible class only' {
        $plan = Get-SetupPlan -Users $teachers
        @($plan.Creates | ForEach-Object DisplayName) | Should -Be @('HSHB Student 2026-2027', 'GCSE1 - 2026-2027', 'Year 3 - 2026-2027', 'Year 4 - 2026-2027')
        @($plan.Creates | ForEach-Object Nickname) | Should -Contain 'year3-2026-2027'
        @($plan.Creates | ForEach-Object DisplayName) | Should -Not -Contain 'Dance - 2026-2027'
        @($plan.Creates | ForEach-Object DisplayName) | Should -Not -Contain 'Year 2 - 2026-2027'
    }

    It 'makes the class teacher and default owners owners' {
        $plan = Get-SetupPlan -Users $teachers
        $y3 = $plan.Creates | Where-Object Nickname -eq 'year3-2026-2027'
        $y3.OwnerIds | Should -Be @($teachers[0].id, $teachers[2].id)
        ($plan.Creates | Where-Object Nickname -eq 'students-2026-2027').OwnerIds | Should -Be @($teachers[2].id)
    }

    It 'skips a Team with no owner it can find, and reports unknown owners' {
        $plan = Get-SetupPlan -Users @($teachers[0]) -Config (New-TestConfig @{ DefaultTeamOwners = @() })
        @($plan.Creates | ForEach-Object Nickname) | Should -Be @('year3-2026-2027')
        @($plan.Issues | Where-Object Type -eq 'NO OWNER').Count | Should -Be 3
        @($plan.Issues | Where-Object Type -eq 'OWNER NOT FOUND' | ForEach-Object Detail) | Should -Contain 'no Microsoft 365 user with address t4@school.example'
    }

    It 'fixes existing Teams: turns groups into Teams, renames, adds owners, never removes owners' {
        $groups = @(New-CurrentTeams)
        ($groups | Where-Object { $_.mailNickname -eq 'year3-2026-2027' }).displayName = 'Old name'
        ($groups | Where-Object { $_.mailNickname -eq 'year4-2026-2027' }).resourceProvisioningOptions = @()
        $plan = Get-SetupPlan -Users $teachers -Groups $groups
        $plan.Creates | Should -BeNullOrEmpty
        @($plan.EnableTeams | ForEach-Object Nickname) | Should -Be @('year4-2026-2027')
        $plan.Renames[0].To | Should -Be 'Year 3 - 2026-2027'
        @($plan.OwnerAdds | Where-Object Nickname -eq 'year3-2026-2027' | ForEach-Object UserId) | Should -Be @($teachers[0].id, $teachers[2].id)
    }

    It 'lists past Teams and does not create over a user nickname' {
        $past = New-GraphGroup -Name 'Year 3 - 2025-2026' -Nickname 'year3-2025-2026'
        $clash = New-GraphUser -Upn 'students-2026-2027@school.example' -Given 'Odd' -Surname 'User'
        $plan = Get-SetupPlan -Users (@($teachers) + $clash) -Groups @($past)
        @($plan.Issues | Where-Object Type -eq 'PAST TEAM' | ForEach-Object Team) | Should -Be @('Year 3 - 2025-2026')
        @($plan.Issues | Where-Object Type -eq 'NICKNAME TAKEN').Count | Should -Be 1
        @($plan.Creates | ForEach-Object Nickname) | Should -Not -Contain 'students-2026-2027'
    }
}

Describe 'The person running setup-teams.ps1 owns the year group' {
    BeforeAll {
        $script:me = New-GraphUser -Upn 'admin.person@school.example' -Given 'Ad' -Surname 'Min'
        $script:noDefaults = New-TestConfig @{ DefaultTeamOwners = @() }
    }

    It 'makes the signed-in account an owner of the new year group only' {
        $plan = Get-SetupPlan -Users (@($teachers) + $me) -Config $noDefaults -CreatorUpn 'Admin.Person@school.example'
        ($plan.Creates | Where-Object Nickname -eq 'students-2026-2027').OwnerIds | Should -Be @($me.id)
        ($plan.Creates | Where-Object Nickname -eq 'year3-2026-2027').OwnerIds | Should -Be @($teachers[0].id)
        @($plan.Issues | Where-Object { $_.Type -eq 'NO OWNER' -and $_.Team -eq 'HSHB Student 2026-2027' }) | Should -BeNullOrEmpty
    }

    It 'does not add whoever runs it later to an existing year group' {
        $year = New-GraphGroup -Name 'HSHB Student 2026-2027' -Nickname 'students-2026-2027' -OwnerIds @($teachers[2].id) -IsTeam $false
        $plan = Get-SetupPlan -Users (@($teachers) + $me) -Groups @($year) -Config $noDefaults -CreatorUpn 'admin.person@school.example'
        @($plan.OwnerAdds | Where-Object UserId -eq $me.id) | Should -BeNullOrEmpty
        @($plan.Creates | ForEach-Object Nickname) | Should -Not -Contain 'students-2026-2027'
    }

    It 'reports NO OWNER when nobody signed in is known and there are no default owners' {
        $plan = Get-SetupPlan -Users $teachers -Config $noDefaults
        @($plan.Issues | Where-Object { $_.Type -eq 'NO OWNER' -and $_.Team -eq 'HSHB Student 2026-2027' }).Count | Should -Be 1
    }

    It 'reports a signed-in account that is not a user in the tenant' {
        $plan = Get-SetupPlan -Users $teachers -Config $noDefaults -CreatorUpn 'guest@elsewhere.example'
        @($plan.Issues | Where-Object Type -eq 'OWNER NOT FOUND' | ForEach-Object Detail) | Should -Contain 'the signed-in account guest@elsewhere.example was not found among users'
    }
}

Describe 'Get-SignedInUpn' {
    It 'returns the signed-in account, lowercased' {
        Mock Get-MgContext { [pscustomobject]@{ Account = 'Admin.Person@School.Example'; Scopes = @() } }
        Get-SignedInUpn | Should -Be 'admin.person@school.example'
    }

    It 'returns nothing when not signed in or the account is unknown' {
        Mock Get-MgContext { $null }
        Get-SignedInUpn | Should -Be ''
        Mock Get-MgContext { [pscustomobject]@{ Scopes = @() } }
        Get-SignedInUpn | Should -Be ''
    }
}

Describe 'Invoke-TeamSetupPlan' {
    It 'creates private Teams with owners, and a second plan has nothing to do' {
        $tenant = New-FakeTenant -Users $teachers
        Mock Invoke-MgGraphRequest { Invoke-FakeGraph -Tenant $tenant -Method $Method -Uri $Uri -Body $Body }
        $desired = Get-TestDesired -Students @(New-TestStudent 'S1' 'A' 'B')
        $plan = New-TeamSetupPlan -Desired $desired -State (New-TestState -Users $teachers) -Config (New-TestConfig)
        $result = Invoke-TeamSetupPlan -Plan $plan -RetryDelaySeconds 0
        $result.Created | Should -Be 4
        $result.Failed | Should -Be 0

        $post = @($tenant.Calls | Where-Object { $_.Method -eq 'POST' -and $_.Uri -eq 'v1.0/groups' })[0].Body
        $post.visibility | Should -Be 'Private'
        $post.groupTypes | Should -Be @('Unified')
        # The year group is a plain group (YearTeamIsTeam = $false); class groups become Teams.
        @($tenant.Calls | Where-Object { $_.Method -eq 'PUT' -and $_.Uri -match '/team$' }).Count | Should -Be 3
        $year = @($tenant.Groups | Where-Object { $_['mailNickname'] -eq 'students-2026-2027' })[0]
        $year['displayName'] | Should -Be 'HSHB Student 2026-2027'
        $year['resourceProvisioningOptions'] | Should -BeNullOrEmpty

        $again = New-TeamSetupPlan -Desired $desired -State @{ Users = Get-GraphUsers; Groups = Get-GraphUnifiedGroups } -Config (New-TestConfig)
        $again.Creates + $again.EnableTeams + $again.Renames + $again.OwnerAdds | Should -BeNullOrEmpty
    }

    It 'retries turning a new group into a Team' {
        $tenant = New-FakeTenant -Users $teachers
        $script:putAttempts = 0
        Mock Invoke-MgGraphRequest {
            if ($Method -eq 'PUT') { $script:putAttempts++; if ($script:putAttempts -eq 1) { throw 'group not ready (404)' } }
            Invoke-FakeGraph -Tenant $tenant -Method $Method -Uri $Uri -Body $Body
        }
        $desired = Get-TestDesired -Students @(New-TestStudent 'S1' 'A' 'B')
        $plan = New-TeamSetupPlan -Desired $desired -State (New-TestState -Users $teachers) -Config (New-TestConfig)
        $plan.Creates = @($plan.Creates | Where-Object IsTeam | Select-Object -First 1)
        $result = Invoke-TeamSetupPlan -Plan $plan -RetryDelaySeconds 0
        $result.Created | Should -Be 1
        $script:putAttempts | Should -Be 2
    }
}
