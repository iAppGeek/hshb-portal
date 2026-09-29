#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
# Run: pwsh -c "Invoke-Pester ./tests"

BeforeAll {
    . (Join-Path $PSScriptRoot 'TestHelpers.ps1')
    . (Join-Path $script:Root 'lib/Reports.ps1')
}

Describe 'Save-PrivateCsv' {
    It 'writes rows to an owner-only file in an owner-only folder' {
        $path = Join-Path $TestDrive 'reports/people.csv'
        Save-PrivateCsv -Path $path -Rows @([pscustomobject]@{ Name = 'Alice'; Code = 'S001' }) | Should -Be $path

        $rows = @(Import-Csv -LiteralPath $path)
        $rows.Count | Should -Be 1
        $rows[0].Code | Should -Be 'S001'
        if ($IsMacOS -or $IsLinux) {
            (Get-Item -LiteralPath $path).UnixMode | Should -Be '-rw-------'
            (Get-Item -LiteralPath (Split-Path $path)).UnixMode | Should -Be 'drwx------'
        }
    }

    It 'writes just the header when there are no rows' {
        $path = Join-Path $TestDrive 'empty.csv'
        Save-PrivateCsv -Path $path -Rows @() -Columns @('A', 'B') | Out-Null
        Get-Content -LiteralPath $path | Should -Be '"A","B"'
    }
}

Describe 'Scripts' {
    It '<Name> parses without errors' -ForEach @(
        Get-ChildItem -Path (Join-Path (Split-Path -Parent $PSScriptRoot) '*.ps1') | ForEach-Object { @{ Name = $_.Name; Path = $_.FullName } }
    ) {
        $errors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$null, [ref]$errors) | Out-Null
        $errors | Should -BeNullOrEmpty
    }
}
