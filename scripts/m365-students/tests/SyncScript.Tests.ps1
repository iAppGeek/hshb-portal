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
        ($students | Where-Object StudentCode -eq 'S002').ExpectedTeams | Should -Be 'Students 2026-27; Year 4 2026-27'

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
