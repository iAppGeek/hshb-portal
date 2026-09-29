#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
# Run: pwsh -c "Invoke-Pester ./tests"

BeforeAll {
    . (Join-Path $PSScriptRoot 'TestHelpers.ps1')
    . (Join-Path $script:Root '../shared/Common.ps1')
    . (Join-Path $script:Root 'lib/StudentConfig.ps1')
    . (Join-Path $script:Root 'lib/StudentData.ps1')
    . (Join-Path $script:Root 'lib/Graph.ps1')
    . (Join-Path $script:Root 'lib/StudentPlan.ps1')
    . (Join-Path $script:Root 'lib/TeamChanges.ps1')
    Mock Write-Host { }

    function New-Change {
        param([string]$Action, [string]$Nickname, [string]$Code, [string]$UserId = 'user-1')
        return [pscustomobject]@{
            ChangeId = Get-TeamChangeId -Action $Action -Nickname $Nickname -Code $Code; Action = $Action
            GroupId = "group-$Nickname"; TeamNickname = $Nickname; Team = $Nickname; UserId = $UserId
            StudentCode = $Code; StudentName = "Student $Code"; Reason = 'test'
        }
    }

    function New-Row {
        param([object]$Change, [string]$Approved = 'yes')
        $row = @(ConvertTo-TeamChangeRows -TeamChanges @($Change) -GeneratedAt '2026-09-29T10:00:00+00:00')[0]
        $row.Approved = $Approved
        return $row
    }
}

Describe 'Select-ApprovedTeamChanges' {
    BeforeAll {
        $script:add = New-Change 'ADD' 'year3-2026-2027' 'S001'
        $script:remove = New-Change 'REMOVE' 'year4-2026-2027' 'S001'
        $script:newAccount = New-Change 'ADD' 'students-2026-2027' 'S002' -UserId $null
    }

    It 'applies only rows marked yes (any case, spaces allowed)' {
        $rows = @((New-Row $add ' YES '), (New-Row $remove ''))
        $result = Select-ApprovedTeamChanges -Rows $rows -TeamChanges @($add, $remove)
        @($result.ToApply | ForEach-Object Action) | Should -Be @('ADD')
        $result.NotApproved | Should -Be 1
    }

    It 'treats anything but yes as not approved' {
        $result = Select-ApprovedTeamChanges -Rows @((New-Row $add 'y'), (New-Row $remove 'no')) -TeamChanges @($add, $remove)
        $result.ToApply | Should -BeNullOrEmpty
        $result.NotApproved | Should -Be 2
    }

    It 'skips approved rows that are no longer in the plan' {
        $result = Select-ApprovedTeamChanges -Rows @(New-Row $add) -TeamChanges @()
        $result.ToApply | Should -BeNullOrEmpty
        $result.Skipped[0].Reason | Should -Match 'no longer needed'
    }

    It 'skips a row whose details were edited after it was written' {
        $row = New-Row $add
        $row.TeamNickname = 'year4-2026-2027'
        $result = Select-ApprovedTeamChanges -Rows @($row) -TeamChanges @($add, (New-Change 'ADD' 'year4-2026-2027' 'S001'))
        $result.ToApply | Should -BeNullOrEmpty
        $result.Skipped[0].Reason | Should -Match 'edited'
    }

    It 'ignores rows added by hand that the plan never proposed' {
        $invented = New-Change 'ADD' 'year3-2025-2026' 'S123'
        $result = Select-ApprovedTeamChanges -Rows @(New-Row $invented) -TeamChanges @($add)
        $result.ToApply | Should -BeNullOrEmpty
    }

    It 'waits for accounts that do not exist yet' {
        $result = Select-ApprovedTeamChanges -Rows @(New-Row $newAccount) -TeamChanges @($newAccount)
        $result.ToApply | Should -BeNullOrEmpty
        $result.Skipped[0].Reason | Should -Match 'run -Apply first'
    }

    It "uses the plan's ids, never ids from the file" {
        $row = New-Row $add
        $row | Add-Member -NotePropertyName GroupId -NotePropertyValue 'evil-group' -Force
        $result = Select-ApprovedTeamChanges -Rows @($row, $row) -TeamChanges @($add)
        $result.ToApply.Count | Should -Be 1
        $result.ToApply[0].GroupId | Should -Be 'group-year3-2026-2027'
    }
}

Describe 'Read-TeamChangeFile' {
    It 'reads a file written by the dry run' {
        $path = Join-Path $TestDrive 'changes.csv'
        ConvertTo-TeamChangeRows -TeamChanges @(New-Change 'ADD' 'students-2026-2027' 'S001') -GeneratedAt '2026-09-29T10:00:00+00:00' |
            Export-Csv -LiteralPath $path
        $rows = Read-TeamChangeFile -Path $path -MaxAgeHours 24 -Now '2026-09-29T12:00:00+00:00'
        $rows.Count | Should -Be 1
    }

    It 'refuses an old file' {
        $path = Join-Path $TestDrive 'old.csv'
        ConvertTo-TeamChangeRows -TeamChanges @(New-Change 'ADD' 'students-2026-2027' 'S001') -GeneratedAt '2026-09-27T10:00:00+00:00' |
            Export-Csv -LiteralPath $path
        { Read-TeamChangeFile -Path $path -MaxAgeHours 24 -Now '2026-09-29T12:00:00+00:00' } | Should -Throw '*hours old*'
    }

    It 'refuses a file without the expected columns' {
        $path = Join-Path $TestDrive 'bad.csv'
        @([pscustomobject]@{ Team = 'x'; Approved = 'yes' }) | Export-Csv -LiteralPath $path
        { Read-TeamChangeFile -Path $path } | Should -Throw "*missing the 'ChangeId' column*"
    }
}

Describe 'Invoke-TeamChanges' {
    It 'adds and removes members and carries on after a failure' {
        $user = New-StudentAccount 'a.b@school.example' 'A' 'B' 'S001'
        $groups = New-CurrentTeams -Members @{ Y4 = @($user.id) }
        $tenant = New-FakeTenant -Users @($user) -Groups $groups
        Mock Invoke-MgGraphRequest { Invoke-FakeGraph -Tenant $tenant -Method $Method -Uri $Uri -Body $Body }
        $y3 = @($groups | Where-Object { $_.mailNickname -eq 'year3-2026-2027' })[0]
        $y4 = @($groups | Where-Object { $_.mailNickname -eq 'year4-2026-2027' })[0]
        $changes = @(
            [pscustomobject]@{ Action = 'ADD'; GroupId = $y3.id; UserId = $user.id; StudentCode = 'S001'; TeamNickname = 'year3-2026-2027' }
            [pscustomobject]@{ Action = 'ADD'; GroupId = 'missing-group'; UserId = $user.id; StudentCode = 'S001'; TeamNickname = 'nope' }
            [pscustomobject]@{ Action = 'REMOVE'; GroupId = $y4.id; UserId = $user.id; StudentCode = 'S001'; TeamNickname = 'year4-2026-2027' }
        )
        $result = Invoke-TeamChanges -Changes $changes
        $result.Added | Should -Be 1
        $result.Removed | Should -Be 1
        $result.Failed | Should -Be 1
        $y3.members | Should -Contain $user.id
        $y4.members | Should -Not -Contain $user.id
    }
}
