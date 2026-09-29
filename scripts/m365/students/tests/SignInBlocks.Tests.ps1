#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
# Run: pwsh -c "Invoke-Pester ./tests"

BeforeAll {
    . (Join-Path $PSScriptRoot 'TestHelpers.ps1')
    . (Join-Path $script:Root '../shared/Common.ps1')
    . (Join-Path $script:Root 'lib/StudentConfig.ps1')
    . (Join-Path $script:Root 'lib/StudentData.ps1')
    . (Join-Path $script:Root 'lib/Graph.ps1')
    . (Join-Path $script:Root 'lib/StudentPlan.ps1')
    . (Join-Path $script:Root 'lib/SignInBlocks.ps1')
    Mock Write-Host { }

    function New-Block {
        param([string]$UserId = [guid]::NewGuid().ToString(), [string]$Upn = 'kid@school.example')
        return [pscustomobject]@{ ChangeId = Get-SignInBlockId -UserId $UserId; UserId = $UserId; Upn = $Upn; AccountName = 'Kid'; StudentCode = ''; Reason = 'UNLINKED: NOT IN DATABASE - test' }
    }

    function New-Row {
        param([object]$Block, [string]$Approved = 'yes')
        $row = @(ConvertTo-SignInBlockRows -SignInBlocks @($Block) -GeneratedAt '2026-09-29T10:00:00+00:00')[0]
        $row.Approved = $Approved
        return $row
    }
}

Describe 'Select-ApprovedSignInBlocks' {
    BeforeAll { $script:a = New-Block; $script:b = New-Block }

    It 'returns only approved rows still proposed' {
        $result = Select-ApprovedSignInBlocks -Rows @((New-Row $a 'Yes'), (New-Row $b '')) -SignInBlocks @($a, $b)
        @($result.ToApply | ForEach-Object UserId) | Should -Be @($a.UserId)
        $result.NotApproved | Should -Be 1
    }

    It 'skips rows no longer proposed' {
        $result = Select-ApprovedSignInBlocks -Rows @(New-Row $a) -SignInBlocks @()
        $result.ToApply | Should -BeNullOrEmpty
        $result.Skipped[0].Reason | Should -Match 'no longer proposed'
    }

    It 'skips a row whose UserId or Action was edited' {
        $row = New-Row $a; $row.UserId = $b.UserId
        $row2 = New-Row $b; $row2.Action = 'DELETE'
        $result = Select-ApprovedSignInBlocks -Rows @($row, $row2) -SignInBlocks @($a, $b)
        $result.ToApply | Should -BeNullOrEmpty
        @($result.Skipped | ForEach-Object Reason) | ForEach-Object { $_ | Should -Match 'edited' }
    }
}

Describe 'Invoke-SignInBlocks' {
    It 'sends only accountEnabled = false, and carries on after a failure' {
        $kid = New-GraphUser -Upn 'kid@school.example' -Given 'K' -Surname 'Id'
        $tenant = New-FakeTenant -Users @($kid)
        Mock Invoke-MgGraphRequest { Invoke-FakeGraph -Tenant $tenant -Method $Method -Uri $Uri -Body $Body }
        $result = Invoke-SignInBlocks -Blocks @((New-Block -UserId $kid.id), (New-Block -UserId 'missing-user'))
        $result.Blocked | Should -Be 1
        $result.Failed | Should -Be 1
        $kid['accountEnabled'] | Should -BeFalse
        $patch = @($tenant.Calls | Where-Object Method -eq 'PATCH')[0].Body
        @($patch.Keys) | Should -Be @('accountEnabled')
        $patch.accountEnabled | Should -BeFalse
    }
}
