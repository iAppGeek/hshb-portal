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
