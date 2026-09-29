#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
# Run: pwsh -c "Invoke-Pester ./tests"

BeforeAll {
    . (Join-Path $PSScriptRoot 'TestHelpers.ps1')
    . (Join-Path $script:Root 'lib/Graph.ps1')
    . (Join-Path $script:Root 'lib/Inventory.ps1')
}

Describe 'Reading the tenant' {
    BeforeEach {
        $script:alice = New-GraphUser -Upn 'alice.smith@school.example' -Given 'Alice' -Surname 'Smith' -EmployeeId 'S001' `
            -Attributes @{ CustomAttribute1 = 'Student'; CustomAttribute4 = 'Student' } -SkuIds @('sku-student')
        $script:bob = New-GraphUser -Upn 'bob@school.example' -Given 'Bob' -Surname 'Jones' -Attributes @{ CustomAttribute1 = 'Teacher' }
        $script:carol = New-GraphUser -Upn 'carol.white@school.example' -Given 'Carol' -Surname 'White' -Enabled $false
        $group = New-GraphGroup -Name 'Year 3 2026-27' -Nickname 'stu-class-abcd1234' -MemberIds @($alice.id) -OwnerIds @($bob.id)
        $other = New-GraphGroup -Name 'Staff' -Nickname 'staff' -MemberIds @($bob.id) -IsTeam $false
        $script:tenant = New-FakeTenant -Users @($alice, $bob, $carol) -Groups @($group, $other) -PageSize 2
        Mock Invoke-MgGraphRequest { Invoke-FakeGraph -Tenant $script:tenant -Method $Method -Uri $Uri -Body $Body }
    }

    It 'follows nextLink paging and maps attributes to Exchange names' {
        $users = Get-GraphUsers
        $users.Count | Should -Be 3
        $a = $users | Where-Object Upn -eq 'alice.smith@school.example'
        $a.EmployeeId | Should -Be 'S001'
        $a.Attributes.CustomAttribute1 | Should -Be 'Student'
        $a.Attributes.CustomAttribute4 | Should -Be 'Student'
        $a.Attributes.CustomAttribute2 | Should -Be ''
        $a.SkuIds | Should -Be @('sku-student')
        $a.Addresses | Should -Be @('alice.smith@school.example')
        ($users | Where-Object Upn -eq 'carol.white@school.example').Enabled | Should -BeFalse
    }

    It 'reads groups with members, owners and whether they are Teams' {
        $groups = Get-GraphUnifiedGroups
        $groups.Count | Should -Be 2
        $class = $groups | Where-Object Nickname -eq 'stu-class-abcd1234'
        $class.IsTeam | Should -BeTrue
        $class.MemberIds | Should -Be @($alice.id)
        $class.OwnerIds | Should -Be @($bob.id)
        ($groups | Where-Object Nickname -eq 'staff').IsTeam | Should -BeFalse
    }

    It 'only ever sends GET requests' {
        $null = Get-GraphTenantState
        $script:tenant.Calls.Count | Should -BeGreaterThan 0
        Get-WriteCalls -Tenant $script:tenant | Should -BeNullOrEmpty
    }

    It 'builds inventory rows and a summary with counts only' {
        $state = Get-GraphTenantState
        $rows = Get-InventoryRows -State $state -Config (New-TestConfig)

        $rows.Users.Count | Should -Be 3
        $aliceRow = $rows.Users | Where-Object Upn -eq 'alice.smith@school.example'
        $aliceRow.Licences | Should -Be 'STUDENT_SKU'
        $aliceRow.Groups | Should -Be 'Year 3 2026-27'
        $aliceRow.CustomAttribute4 | Should -Be 'Student'

        ($rows.Teams | Where-Object Nickname -eq 'stu-class-abcd1234').Managed | Should -BeTrue
        ($rows.Teams | Where-Object Nickname -eq 'staff').Managed | Should -BeFalse
        $rows.Licences[0].Available | Should -Be 490

        $summary = $rows.Summary -join "`n"
        $summary | Should -Match 'Users:\s+3 \(enabled: 2\)'
        $summary | Should -Match 'username like first\.last:\s+2'
        $summary | Should -Match 'CustomAttribute1 = Student: 1'
        $summary | Should -Not -Match 'alice'
    }
}

Describe 'Connect-SyncGraph' {
    BeforeEach {
        Mock Get-Module { @{ Name = 'Microsoft.Graph.Authentication' } } -ParameterFilter { $ListAvailable }
        Mock Import-Module { }
        Mock Connect-MgGraph { }
        Mock Disconnect-MgGraph { }
    }

    It 'asks for read-only scopes by default' {
        Mock Get-MgContext { $null }
        Connect-SyncGraph
        Should -Invoke Connect-MgGraph -Times 1 -ParameterFilter {
            @($Scopes | Where-Object { $_ -match 'ReadWrite' }).Count -eq 0 -and $Scopes -contains 'User.Read.All'
        }
    }

    It 'asks for write scopes with -Write' {
        Mock Get-MgContext { $null }
        Connect-SyncGraph -Write
        Should -Invoke Connect-MgGraph -Times 1 -ParameterFilter { $Scopes -contains 'User.ReadWrite.All' -and $Scopes -contains 'Group.ReadWrite.All' }
    }

    It 'reuses a session that already has the scopes' {
        Mock Get-MgContext { [pscustomobject]@{ Scopes = @('User.Read.All', 'GroupMember.Read.All', 'Directory.Read.All') } }
        Connect-SyncGraph
        Should -Invoke Connect-MgGraph -Times 0
    }

    It 'signs in again when a read-only session needs to write' {
        Mock Get-MgContext { [pscustomobject]@{ Scopes = @('User.Read.All', 'GroupMember.Read.All', 'Directory.Read.All') } }
        Connect-SyncGraph -Write
        Should -Invoke Disconnect-MgGraph -Times 1
        Should -Invoke Connect-MgGraph -Times 1
    }
}
