#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
# Run: pwsh -c "Invoke-Pester ./tests"

BeforeAll {
    . (Join-Path $PSScriptRoot 'TestHelpers.ps1')
    . (Join-Path $script:Root 'lib/StudentConfig.ps1')
}

Describe 'Assert-StudentConfig' {
    It 'accepts the committed config.psd1' {
        $config = Import-PowerShellDataFile (Join-Path $script:Root 'config.psd1')
        { Assert-StudentConfig -Config $config } | Should -Not -Throw
    }

    It 'accepts the test config' {
        { Assert-StudentConfig -Config (New-TestConfig) } | Should -Not -Throw
    }

    It 'rejects a missing key' {
        $config = New-TestConfig
        $config.Remove('Domain')
        { Assert-StudentConfig -Config $config } | Should -Throw "*missing 'Domain'*"
    }

    It 'rejects CustomAttribute1 as the membership attribute' {
        { Assert-StudentConfig -Config (New-TestConfig @{ MembershipAttribute = 'CustomAttribute1' }) } |
            Should -Throw '*CustomAttribute2 to CustomAttribute15*'
    }

    It 'rejects a tag with punctuation' {
        { Assert-StudentConfig -Config (New-TestConfig @{ Tag = 'Stu dent' }) } | Should -Throw '*letters and digits*'
    }

    It 'rejects a year group that is both eligible and ignored, ignoring case and spaces' {
        $config = New-TestConfig @{ IgnoredYearGroups = @('pre-school', ' gcse ') }
        { Assert-StudentConfig -Config $config } | Should -Throw "*listed more than once*"
    }

    It 'rejects an empty eligible list' {
        { Assert-StudentConfig -Config (New-TestConfig @{ EligibleYearGroups = @() }) } | Should -Throw '*at least one*'
    }

    It 'rejects an invalid domain and usage location' {
        { Assert-StudentConfig -Config (New-TestConfig @{ Domain = 'School.Example' }) } | Should -Throw '*Domain*'
        { Assert-StudentConfig -Config (New-TestConfig @{ UsageLocation = 'gbr' }) } | Should -Throw '*UsageLocation*'
    }

    It 'rejects a removal limit outside 0-100' {
        { Assert-StudentConfig -Config (New-TestConfig @{ MaxTeamRemovalPercent = 150 }) } | Should -Throw '*0 to 100*'
    }
}

Describe 'Assert-NoContactSyncClash' {
    It 'passes against the committed contact sync config' {
        $contact = Import-PowerShellDataFile (Join-Path $script:Root '../m365-sync/config.psd1')
        { Assert-NoContactSyncClash -Config (New-TestConfig) -ContactConfig $contact } | Should -Not -Throw
    }

    It 'fails when the contact sync also uses the Student tag' {
        $contact = @{ Tags = @(@{ Tag = 'student'; MembershipAttribute = 'CustomAttribute9' }) }
        { Assert-NoContactSyncClash -Config (New-TestConfig) -ContactConfig $contact } | Should -Throw '*untag every student*'
    }

    It 'fails when the contact sync uses the same membership attribute' {
        $contact = @{ Tags = @(@{ Tag = 'Admin'; MembershipAttribute = 'CustomAttribute4' }) }
        { Assert-NoContactSyncClash -Config (New-TestConfig) -ContactConfig $contact } | Should -Throw "*already used by tag 'Admin'*"
    }
}

Describe 'Import-StudentConfig' {
    It 'loads the committed config and checks it against the contact sync' {
        $config = Import-StudentConfig -Path (Join-Path $script:Root 'config.psd1') `
            -ContactSyncConfigPath (Join-Path $script:Root '../m365-sync/config.psd1')
        $config.Tag | Should -Be 'Student'
    }

    It 'throws on a clash found in the contact sync config file' {
        $path = Join-Path $TestDrive 'contact.psd1'
        Set-Content -LiteralPath $path -Value "@{ Tags = @(@{ Tag = 'Student'; MembershipAttribute = 'CustomAttribute9' }) }"
        { Import-StudentConfig -Path (Join-Path $script:Root 'config.psd1') -ContactSyncConfigPath $path } |
            Should -Throw '*untag every student*'
    }

    It 'warns and continues when the contact sync config is missing' {
        $config = Import-StudentConfig -Path (Join-Path $script:Root 'config.psd1') `
            -ContactSyncConfigPath (Join-Path $TestDrive 'missing.psd1') -WarningVariable warnings -WarningAction SilentlyContinue
        $config | Should -Not -BeNullOrEmpty
        $warnings | Should -Not -BeNullOrEmpty
    }
}

Describe 'Get-YearGroupEligibility' {
    It 'classifies <Value> as <Expected>' -ForEach @(
        @{ Value = '3'; Expected = 'Eligible' }
        @{ Value = ' gcse '; Expected = 'Eligible' }
        @{ Value = 'A Level'; Expected = 'Eligible' }
        @{ Value = '2'; Expected = 'Ignored' }
        @{ Value = 'Pre-School'; Expected = 'Ignored' }
        @{ Value = 'All'; Expected = 'Ignored' }
        @{ Value = 'Year 7'; Expected = 'Unknown' }
        @{ Value = ''; Expected = 'Unknown' }
    ) {
        Get-YearGroupEligibility -YearGroup $Value -Config (New-TestConfig) | Should -Be $Expected
    }
}

Describe 'Team naming' {
    BeforeAll { . (Join-Path $script:Root 'lib/StudentData.ps1') }

    It 'turns 2026-27 into 2026-2027' {
        Get-LongYearCode '2026-27' | Should -Be '2026-2027'
        Get-LongYearCode '2099-00' | Should -Be '2099-2100'
    }

    It 'names class Teams like the ones made by hand' {
        $config = Import-PowerShellDataFile (Join-Path $script:Root 'config.psd1')
        Get-ClassTeamNickname -ClassName 'Year 3' -YearCode '2026-27' -Config $config | Should -Be 'year3-2026-2027'
        Get-ClassTeamNickname -ClassName 'A Level' -YearCode '2026-27' -Config $config | Should -Be 'alevel-2026-2027'
        Get-ClassTeamNickname -ClassName 'gcse ii' -YearCode '2026-27' -Config $config | Should -Be 'gcse2-2026-2027'
        Get-ClassTeamBaseName -ClassName 'GCSE III' -Config $config | Should -Be 'GCSE3'
        Get-YearTeamNickname -YearCode '2026-27' -Config $config | Should -Be 'students-2026-2027'
    }

    It 'recognises any year of these Teams, but not other groups' {
        $pattern = Get-ManagedTeamPattern -Config (Import-PowerShellDataFile (Join-Path $script:Root 'config.psd1'))
        'year3-2025-2026' | Should -Match $pattern
        'students-2026-2027' | Should -Match $pattern
        'students2025' | Should -Not -Match $pattern
        'hshb-automation' | Should -Not -Match $pattern
        'teachers' | Should -Not -Match $pattern
    }

    It 'rejects nickname formats without the year or with bad characters' {
        { Assert-StudentConfig -Config (New-TestConfig @{ ClassTeamNicknameFormat = '{0}' }) } | Should -Throw '*must include the year*'
        { Assert-StudentConfig -Config (New-TestConfig @{ YearTeamNicknameFormat = 'Students {2}' }) } | Should -Throw '*may only contain*'
        { Assert-StudentConfig -Config (New-TestConfig @{ ClassTeamNicknameFormat = 'class-{2}' }) } | Should -Throw '*must include the class*'
        { Assert-StudentConfig -Config (New-TestConfig @{ YearTeamIsTeam = 'no' }) } | Should -Throw '*YearTeamIsTeam*'
    }

    It 'rejects two eligible classes that would share a Team, but not ignored ones' {
        $classes = @(
            @{ id = '30000000-0000-0000-0000-000000000000'; name = 'Year 3'; yearGroup = '3'; teacherEmail = $null }
            @{ id = '31000000-0000-0000-0000-000000000000'; name = 'Year-3'; yearGroup = '3'; teacherEmail = $null }
        )
        $data = New-TestStudentData -Students @(New-TestStudent 'S1' 'A' 'B') -Classes $classes
        { ConvertTo-DesiredStudentState -Data $data -Config (New-TestConfig) } | Should -Throw '*share the mail nickname year3-2026-2027*'

        $classes[1].yearGroup = '2'
        $data = New-TestStudentData -Students @(New-TestStudent 'S1' 'A' 'B') -Classes $classes
        { ConvertTo-DesiredStudentState -Data $data -Config (New-TestConfig) } | Should -Not -Throw
    }
}
