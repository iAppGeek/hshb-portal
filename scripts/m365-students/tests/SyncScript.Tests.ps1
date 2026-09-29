#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
# End-to-end runs of the scripts against a fake Microsoft 365 tenant.
# Run: pwsh -c "Invoke-Pester ./tests"

BeforeAll {
    . (Join-Path $PSScriptRoot 'TestHelpers.ps1')
    $script:SyncScript = Join-Path $script:Root 'sync-students.ps1'
    $script:InventoryScript = Join-Path $script:Root 'inventory-m365.ps1'

    function Save-TestData {
        param([object[]]$Students, [string[]]$InactiveCodes = @(), [string]$GeneratedAt = (Get-Date).ToString('o'))
        $path = Join-Path $TestDrive 'students.json'
        New-TestStudentData -Students $Students -InactiveCodes $InactiveCodes -GeneratedAt $GeneratedAt |
            ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $path
        return $path
    }

    function Save-TestConfig {
        param([hashtable]$Overrides = @{})
        $config = New-TestConfig $Overrides
        $lines = foreach ($k in $config.Keys) {
            $v = $config[$k]
            $value = if ($v -is [array]) { '@(' + (($v | ForEach-Object { "'$_'" }) -join ', ') + ')' }
            elseif ($v -is [hashtable]) { '@{ ' + (($v.Keys | ForEach-Object { "'$_' = '$($v[$_])'" }) -join '; ') + ' }' }
            elseif ($v -is [bool]) { if ($v) { '$true' } else { '$false' } }
            elseif ($v -is [int] -or $v -is [double]) { "$v" }
            else { "'$v'" }
            "    $k = $value"
        }
        $path = Join-Path $TestDrive 'config.psd1'
        Set-Content -LiteralPath $path -Value ("@{`n" + ($lines -join "`n") + "`n}")
        return $path
    }

    function Invoke-SyncScript {
        param([hashtable]$Arguments = @{})
        $params = @{
            DataPath        = $script:DataPath
            ConfigPath      = $script:ConfigPath
            ReportDirectory = (Join-Path $TestDrive 'reports')
            LogDirectory    = (Join-Path $TestDrive 'logs')
        }
        foreach ($k in $Arguments.Keys) { $params[$k] = $Arguments[$k] }
        & $script:SyncScript @params *> $null
        return $LASTEXITCODE
    }

    function Use-FakeGraph {
        param([hashtable]$Tenant, [string[]]$Scopes = @('User.Read.All', 'GroupMember.Read.All', 'Directory.Read.All'))
        # Mock bodies run inside the script under test, so its $script: scope
        # is not this file's: keep the fake tenant global.
        $global:FakeTenant = $Tenant
        $global:FakeGrantedScopes = $Scopes
        Mock Get-Module { @{ Name = 'Microsoft.Graph.Authentication' } } -ParameterFilter { $ListAvailable }
        Mock Import-Module { } -ParameterFilter { $Name -eq 'Microsoft.Graph.Authentication' }
        Mock Get-MgContext { [pscustomobject]@{ Scopes = $global:FakeGrantedScopes } }
        Mock Connect-MgGraph { $global:FakeGrantedScopes = @($Scopes) }
        Mock Disconnect-MgGraph { }
        Mock Invoke-MgGraphRequest { Invoke-FakeGraph -Tenant $global:FakeTenant -Method $Method -Uri $Uri -Body $Body }
    }
}

AfterAll {
    Remove-Variable -Name FakeTenant, FakeGrantedScopes -Scope Global -ErrorAction SilentlyContinue
}

Describe 'sync-students.ps1 dry run' {
    BeforeEach {
        Remove-Item -Recurse -Force (Join-Path $TestDrive 'reports') -ErrorAction SilentlyContinue
        $script:ConfigPath = Save-TestConfig
        $script:DataPath = Save-TestData -Students @(
            (New-TestStudent 'S001' 'Alice' 'Smith' @('Y3')),
            (New-TestStudent 'S002' 'Bob' 'Jones' @('Y4')),
            (New-TestStudent 'S003' 'Cara' 'Lee' @('Y2'))
        )
        $bob = New-GraphUser -Upn 'bjones@school.example' -Given 'Bob' -Surname 'Jones'
        Use-FakeGraph -Tenant (New-FakeTenant -Users @($bob) -Groups (New-CurrentTeams))
    }

    It 'sends only GET requests and changes nothing' {
        Invoke-SyncScript | Should -Be 0
        $global:FakeTenant.Calls.Count | Should -BeGreaterThan 0
        Get-WriteCalls -Tenant $global:FakeTenant | Should -BeNullOrEmpty
        Should -Invoke Connect-MgGraph -Times 0
    }

    It 'writes the reconciliation report and a Team change file with nothing approved' {
        Invoke-SyncScript | Should -Be 0
        $students = @(Import-Csv (Get-ChildItem (Join-Path $TestDrive 'reports') -Filter 'students-*.csv').FullName)
        @($students | ForEach-Object Status | Sort-Object) | Should -Be @('CREATE', 'LINK')
        ($students | Where-Object StudentCode -eq 'S001').Upn | Should -Be 'alice.smith@school.example'
        ($students | Where-Object StudentCode -eq 'S002').ExpectedTeams | Should -Be 'HSHB Student 2026-2027; Year 4 - 2026-2027'

        $changes = @(Import-Csv (Get-ChildItem (Join-Path $TestDrive 'reports') -Filter 'team-changes-*.csv').FullName)
        $changes.Count | Should -Be 4
        $changes | ForEach-Object { $_.Approved | Should -Be ''; $_.Action | Should -Be 'ADD' }
    }

    It 'exits 3 when a Year 3+ student has no code' {
        $script:DataPath = Save-TestData -Students @(New-TestStudent '' 'Alice' 'Smith' @('Y3'))
        Invoke-SyncScript | Should -Be 3
        Get-WriteCalls -Tenant $global:FakeTenant | Should -BeNullOrEmpty
    }

    It 'exits 1 without reading Microsoft 365 when the data is stale' {
        $script:DataPath = Save-TestData -Students @(New-TestStudent 'S001' 'Alice' 'Smith') -GeneratedAt (Get-Date).AddDays(-2).ToString('o')
        Invoke-SyncScript | Should -Be 1
        $global:FakeTenant.Calls | Should -BeNullOrEmpty
    }

    It 'exits 1 for -Only with a code that needs no account' {
        Invoke-SyncScript @{ Only = 'S003' } | Should -Be 1
    }
}

Describe 'sync-students.ps1 -Apply' {
    BeforeEach {
        Remove-Item -Recurse -Force (Join-Path $TestDrive 'reports') -ErrorAction SilentlyContinue
        $script:ConfigPath = Save-TestConfig
        $script:DataPath = Save-TestData -Students @(
            (New-TestStudent 'S001' 'Alice' 'Smith' @('Y3')),
            (New-TestStudent 'S002' 'Bob' 'Jones' @('Y4'))
        )
        $bob = New-GraphUser -Upn 'bjones@school.example' -Given 'Bob' -Surname 'Jones'
        Use-FakeGraph -Tenant (New-FakeTenant -Users @($bob) -Groups (New-CurrentTeams))
    }

    It 'signs in with write access, changes accounts only, and a second dry run plans no account changes' {
        Invoke-SyncScript @{ Apply = $true } | Should -Be 0
        Should -Invoke Connect-MgGraph -Times 1 -ParameterFilter { $Scopes -contains 'User.ReadWrite.All' }
        @($global:FakeTenant.Users | ForEach-Object { $_['userPrincipalName'] } | Sort-Object) | Should -Be @('alice.smith@school.example', 'bjones@school.example')
        @(Get-WriteCalls -Tenant $global:FakeTenant | Where-Object { $_.Uri -match 'groups' }) | Should -BeNullOrEmpty

        Remove-Item -Recurse -Force (Join-Path $TestDrive 'reports')
        $global:FakeTenant.Calls.Clear()
        Invoke-SyncScript | Should -Be 0
        Get-WriteCalls -Tenant $global:FakeTenant | Should -BeNullOrEmpty
        @(Import-Csv (Get-ChildItem (Join-Path $TestDrive 'reports') -Filter 'students-*.csv').FullName | ForEach-Object Status) |
            Should -Be @('OK', 'OK')
    }

    It 'saves the new accounts and passwords to an owner-only file' {
        Invoke-SyncScript @{ Apply = $true } | Should -Be 0
        $file = Get-ChildItem (Join-Path $TestDrive 'reports') -Filter 'new-accounts-*.csv'
        $rows = @(Import-Csv $file.FullName)
        $rows.Count | Should -Be 1
        $rows[0].Upn | Should -Be 'alice.smith@school.example'
        $rows[0].InitialPassword.Length | Should -Be 14
        if ($IsMacOS -or $IsLinux) { $file.UnixMode | Should -Be '-rw-------' }
    }

    It 'only changes the -Only student' {
        Invoke-SyncScript @{ Apply = $true; Only = 'S002' } | Should -Be 0
        @($global:FakeTenant.Users | ForEach-Object { $_['userPrincipalName'] }) | Should -Be @('bjones@school.example')
        @(Get-WriteCalls -Tenant $global:FakeTenant).Count | Should -Be 2   # link + licence
    }

    It 'refuses to apply with an unknown year group and changes nothing' {
        $script:ConfigPath = Save-TestConfig @{ IgnoredYearGroups = @('pre-school', '1', 'All', 'Test') }
        Invoke-SyncScript @{ Apply = $true } | Should -Be 1
        Get-WriteCalls -Tenant $global:FakeTenant | Should -BeNullOrEmpty
    }

    It 'stops at the Team removal limit unless -Force' {
        $a = New-StudentAccount 'alice.smith@school.example' 'Alice' 'Smith' 'S001'
        $groups = New-CurrentTeams -Members @{ Year = @($a.id); Y4 = @($a.id); Y3 = @($a.id) }
        Use-FakeGraph -Tenant (New-FakeTenant -Users @($a) -Groups $groups)
        Invoke-SyncScript @{ Apply = $true } | Should -Be 2
        Get-WriteCalls -Tenant $global:FakeTenant | Should -BeNullOrEmpty
        Invoke-SyncScript @{ Apply = $true; Force = $true } | Should -Be 0
        @(Get-WriteCalls -Tenant $global:FakeTenant | Where-Object { $_.Uri -match 'groups' }) | Should -BeNullOrEmpty
    }
}

Describe 'sync-students.ps1 -ApplyTeamChanges' {
    BeforeEach {
        Remove-Item -Recurse -Force (Join-Path $TestDrive 'reports') -ErrorAction SilentlyContinue
        $script:ConfigPath = Save-TestConfig
        $script:DataPath = Save-TestData -Students @(
            (New-TestStudent 'S001' 'Alice' 'Smith' @('Y3')),
            (New-TestStudent 'S002' 'Bob' 'Jones' @('Y4'))
        )
        $script:alice = New-StudentAccount 'alice.smith@school.example' 'Alice' 'Smith' 'S001'
        $script:bob = New-StudentAccount 'bob.jones@school.example' 'Bob' 'Jones' 'S002' -Department 'Year 4'
        # Bob moved from Year 3 to Year 4; Alice is in no Teams yet.
        $groups = New-CurrentTeams -Members @{ Year = @($bob.id); Y3 = @($bob.id) }
        Use-FakeGraph -Tenant (New-FakeTenant -Users @($alice, $bob) -Groups $groups) -Scopes @('User.ReadWrite.All', 'Group.ReadWrite.All', 'Directory.Read.All')
        $script:ConfigPath = Save-TestConfig @{ MaxTeamRemovalPercent = 100 }
    }

    It 'applies only the approved rows, then a dry run shows only the rest' {
        Invoke-SyncScript | Should -Be 0
        $file = (Get-ChildItem (Join-Path $TestDrive 'reports') -Filter 'team-changes-*.csv').FullName
        $rows = @(Import-Csv $file)
        @($rows | ForEach-Object { "$($_.Action) $($_.StudentCode) $($_.TeamNickname)" } | Sort-Object) | Should -Be @(
            'ADD S001 students-2026-2027', 'ADD S001 year3-2026-2027', 'ADD S002 year4-2026-2027', 'REMOVE S002 year3-2026-2027')
        foreach ($r in $rows) { if ($r.StudentCode -eq 'S002') { $r.Approved = 'yes' } }
        $rows | Export-Csv -LiteralPath $file

        $global:FakeTenant.Calls.Clear()
        Invoke-SyncScript @{ ApplyTeamChanges = $file; KeepData = $true } | Should -Be 0
        $writes = @(Get-WriteCalls -Tenant $global:FakeTenant)
        $writes.Count | Should -Be 2
        @($writes | Where-Object { $_.Uri -match '^v1\.0/users' }) | Should -BeNullOrEmpty

        Remove-Item -Recurse -Force (Join-Path $TestDrive 'reports')
        Invoke-SyncScript | Should -Be 0
        $left = @(Import-Csv (Get-ChildItem (Join-Path $TestDrive 'reports') -Filter 'team-changes-*.csv').FullName)
        @($left | ForEach-Object StudentCode | Select-Object -Unique) | Should -Be @('S001')
    }

    It 'makes no changes when nothing is approved, and deletes the data file only after success' {
        Invoke-SyncScript | Should -Be 0
        $file = (Get-ChildItem (Join-Path $TestDrive 'reports') -Filter 'team-changes-*.csv').FullName
        $global:FakeTenant.Calls.Clear()
        Invoke-SyncScript @{ ApplyTeamChanges = $file } | Should -Be 0
        Get-WriteCalls -Tenant $global:FakeTenant | Should -BeNullOrEmpty
        Test-Path $script:DataPath | Should -BeTrue

        $rows = @(Import-Csv $file); $rows[0].Approved = 'yes'; $rows | Export-Csv -LiteralPath $file
        Invoke-SyncScript @{ ApplyTeamChanges = $file } | Should -Be 0
        Test-Path $script:DataPath | Should -BeFalse
    }

    It 'refuses a stale review file' {
        $file = Join-Path $TestDrive 'old.csv'
        @([pscustomobject]@{ ChangeId = 'x'; Action = 'ADD'; Team = 't'; TeamNickname = 'n'; StudentCode = 'S001'; StudentName = 'A'
                Reason = 'r'; GeneratedAt = (Get-Date).AddDays(-3).ToString('o'); Approved = 'yes' }) | Export-Csv -LiteralPath $file
        Invoke-SyncScript @{ ApplyTeamChanges = $file } | Should -Be 1
        Get-WriteCalls -Tenant $global:FakeTenant | Should -BeNullOrEmpty
    }

    It 'refuses -Apply and -ApplyTeamChanges together' {
        Invoke-SyncScript @{ Apply = $true; ApplyTeamChanges = 'x.csv' } | Should -Be 1
        $global:FakeTenant.Calls | Should -BeNullOrEmpty
    }
}

Describe 'setup-teams.ps1' {
    It 'dry run changes nothing; -Apply creates the Teams; a second run has nothing to do' {
        $script:ConfigPath = Save-TestConfig
        $script:DataPath = Save-TestData -Students @(New-TestStudent 'S001' 'Alice' 'Smith' @('Y3'))
        $owners = @('t3@school.example', 't4@school.example', 'head@school.example') | ForEach-Object { New-GraphUser -Upn $_ -Given 'T' -Surname 'Eacher' }
        Use-FakeGraph -Tenant (New-FakeTenant -Users $owners)
        $script:SetupScript = Join-Path $script:Root 'setup-teams.ps1'
        $common = @{ DataPath = $script:DataPath; ConfigPath = $script:ConfigPath; LogDirectory = (Join-Path $TestDrive 'logs') }

        & $script:SetupScript @common *> $null
        $LASTEXITCODE | Should -Be 0
        Get-WriteCalls -Tenant $global:FakeTenant | Should -BeNullOrEmpty

        & $script:SetupScript @common -Apply *> $null
        $LASTEXITCODE | Should -Be 0
        @($global:FakeTenant.Groups | ForEach-Object { $_['displayName'] } | Sort-Object) |
            Should -Be @('GCSE1 - 2026-2027', 'HSHB Student 2026-2027', 'Year 3 - 2026-2027', 'Year 4 - 2026-2027')

        $global:FakeTenant.Calls.Clear()
        & $script:SetupScript @common -Apply *> $null
        $LASTEXITCODE | Should -Be 0
        Get-WriteCalls -Tenant $global:FakeTenant | Should -BeNullOrEmpty
    }
}

Describe 'inventory-m365.ps1' {
    It 'writes three reports and sends only GET requests' {
        $script:ConfigPath = Save-TestConfig
        Use-FakeGraph -Tenant (New-FakeTenant -Users @(New-GraphUser -Upn 'a.b@school.example' -Given 'A' -Surname 'B') -Groups (New-CurrentTeams))
        & $script:InventoryScript -ConfigPath $script:ConfigPath -ReportDirectory (Join-Path $TestDrive 'inventory') -LogDirectory (Join-Path $TestDrive 'logs') *> $null
        $LASTEXITCODE | Should -Be 0
        @(Get-ChildItem (Join-Path $TestDrive 'inventory') -Filter 'inventory-*.csv').Count | Should -Be 3
        Get-WriteCalls -Tenant $global:FakeTenant | Should -BeNullOrEmpty
    }
}
