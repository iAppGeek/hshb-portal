#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
# Run: pwsh -c "Invoke-Pester ./tests"

BeforeAll {
    . (Join-Path $PSScriptRoot 'TestHelpers.ps1')
    . (Join-Path $script:Root 'lib/StudentConfig.ps1')
    . (Join-Path $script:Root 'lib/StudentData.ps1')
}

Describe 'ConvertTo-DesiredStudentState: eligibility (Year 3 and up)' {
    BeforeAll {
        $script:desired = Get-TestDesired -Students @(
            New-TestStudent 'S001' 'Alice' 'Smith' @('Y3')
            New-TestStudent 'S002' 'Bob' 'Jones' @('Y2')
            New-TestStudent 'S003' 'Cara' 'Lee' @('Nursery')
            New-TestStudent 'S004' 'Dan' 'Ng' @('Dance', 'Y4')
            New-TestStudent 'S005' 'Eve' 'Ali' @('Dance')
            New-TestStudent 'S006' 'Finn' 'Ray' @('Gcse', 'Y4')
            New-TestStudent '' 'Gus' 'Hart' @('Y3')
            New-TestStudent 'S008' 'Hana' 'Ito' @()
        )
    }

    It 'wants accounts only for students with a class in an eligible year group' {
        @($desired.Students.Keys) | Should -Be @('S001', 'S004', 'S006')
    }

    It 'excludes Year 2 and pre-school students and remembers their codes' {
        $desired.Students.Contains('S002') | Should -BeFalse
        $desired.Students.Contains('S003') | Should -BeFalse
        $desired.NotEligibleCodes.Contains('S002') | Should -BeTrue
        $desired.NotEligibleCodes.Contains('S003') | Should -BeTrue
    }

    It 'makes a student in Dance (All) and Year 4 eligible, but Dance alone does not' {
        $desired.Students['S004'].ClassIds | Should -Be @($script:ClassIds.Y4)
        $desired.NotEligibleCodes.Contains('S005') | Should -BeTrue
    }

    It 'flags an eligible student without a code instead of wanting an account' {
        $desired.NoCode.Count | Should -Be 1
        $desired.NoCode[0].FirstName | Should -Be 'Gus'
    }

    It 'flags an active student with no current class' {
        $desired.NoClass.Count | Should -Be 1
        $desired.NoClass[0].Code | Should -Be 'S008'
    }

    It 'puts each student in the year Team and their eligible class Teams only' {
        $desired.YearTeam.Nickname | Should -Be 'students-2026-2027'
        $desired.YearTeam.DisplayName | Should -Be 'HSHB Student 2026-2027'
        $desired.Students['S004'].TeamNicknames | Should -Be @('students-2026-2027', 'year4-2026-2027')
        $desired.Classes[$script:ClassIds.Dance].Eligibility | Should -Be 'Ignored'
        $desired.Classes[$script:ClassIds.Y3].DisplayName | Should -Be 'Year 3 - 2026-2027'
    }

    It 'labels the year groups in config order, for reports' {
        $desired.Students['S001'].YearGroupLabel | Should -Be 'Year 3'
        $desired.Students['S006'].YearGroupLabel | Should -Be 'Year 4, GCSE'
    }

    It 'counts every group' {
        $desired.Counts.Active | Should -Be 8
        $desired.Counts.Eligible | Should -Be 4
        $desired.Counts.NotEligible | Should -Be 3
        $desired.Counts.NoCode | Should -Be 1
        $desired.Counts.NoClass | Should -Be 1
    }
}

Describe 'ConvertTo-DesiredStudentState: year groups' {
    It 'matches year groups ignoring case and spaces' {
        $classes = @(@{ id = $script:ClassIds.Y3; name = 'Year 3'; yearGroup = ' 3 '; teacherEmail = $null }
            @{ id = $script:ClassIds.Gcse; name = 'GCSE'; yearGroup = 'gcse'; teacherEmail = $null })
        $desired = Get-TestDesired -Classes $classes -Students @(
            New-TestStudent 'S1' 'A' 'B' @('Y3'); New-TestStudent 'S2' 'C' 'D' @('Gcse'))
        $desired.Students.Count | Should -Be 2
        $desired.UnknownYearGroups | Should -BeNullOrEmpty
    }

    It 'reports unknown year groups and leaves their students undecided' {
        $classes = @(New-TestClasses) + @(@{ id = '70000000-0000-0000-0000-000000000000'; name = 'Year 7'; yearGroup = 'Year 7'; teacherEmail = $null })
        $student = New-TestStudent 'S1' 'A' 'B' @()
        $student.classIds = @('70000000-0000-0000-0000-000000000000')
        $desired = Get-TestDesired -Classes $classes -Students @($student)
        $desired.UnknownYearGroups | Should -Be @('Year 7')
        $desired.Undetermined.Count | Should -Be 1
        $desired.Students.Count | Should -Be 0
        $desired.NotEligibleCodes.Count | Should -Be 0
    }
}

Describe 'ConvertTo-DesiredStudentState: codes' {
    It 'keys students by upper-case code and keeps the original' {
        $desired = Get-TestDesired -Students @(New-TestStudent ' s001 ' 'A' 'B')
        $desired.Students.Contains('S001') | Should -BeTrue
        $desired.Students['S001'].Code | Should -Be 's001'
    }

    It 'rejects two students sharing a code, ignoring case' {
        { Get-TestDesired -Students @((New-TestStudent 'S001' 'A' 'B'), (New-TestStudent 's001' 'C' 'D')) } |
            Should -Throw '*share a student code*'
    }

    It 'keeps inactive codes, except ones reused by an active student' {
        $desired = Get-TestDesired -Students @(New-TestStudent 'S001' 'A' 'B') -InactiveCodes @('s009', 'S001')
        $desired.InactiveCodes.Contains('S009') | Should -BeTrue
        $desired.InactiveCodes.Contains('S001') | Should -BeFalse
    }
}

Describe 'ConvertTo-DesiredStudentState: validation' {
    It 'rejects data older than the limit' {
        $data = New-TestStudentData -Students @(New-TestStudent 'S1' 'A' 'B') -GeneratedAt '2026-09-27T10:00:00+00:00'
        { ConvertTo-DesiredStudentState -Data $data -Config (New-TestConfig) -Now '2026-09-29T10:00:00+00:00' -MaxAgeHours 24 } |
            Should -Throw '*hours old*'
    }

    It 'accepts fresh data' {
        $data = New-TestStudentData -Students @(New-TestStudent 'S1' 'A' 'B')
        { ConvertTo-DesiredStudentState -Data $data -Config (New-TestConfig) -Now '2026-09-29T12:00:00+00:00' -MaxAgeHours 24 } |
            Should -Not -Throw
    }

    It 'rejects empty data' {
        { ConvertTo-DesiredStudentState -Data (New-TestStudentData -Students @()) -Config (New-TestConfig) } | Should -Throw '*no students*'
    }

    It 'rejects an unknown version, a missing section and several current years' {
        $data = New-TestStudentData -Students @(New-TestStudent 'S1' 'A' 'B')
        $data.version = 2
        { ConvertTo-DesiredStudentState -Data $data -Config (New-TestConfig) } | Should -Throw '*version*'

        $data = New-TestStudentData -Students @(New-TestStudent 'S1' 'A' 'B')
        $data.Remove('classes')
        { ConvertTo-DesiredStudentState -Data $data -Config (New-TestConfig) } | Should -Throw "*missing 'classes'*"

        $data = New-TestStudentData -Students @(New-TestStudent 'S1' 'A' 'B')
        $data.currentYearCount = 2
        { ConvertTo-DesiredStudentState -Data $data -Config (New-TestConfig) } | Should -Throw '*exactly one current academic year*'
    }

    It 'rejects a student in a class missing from the data' {
        $student = New-TestStudent 'S1' 'A' 'B'
        $student.classIds = @('99999999-0000-0000-0000-000000000000')
        { Get-TestDesired -Students @($student) } | Should -Throw '*missing from the data*'
    }
}

Describe 'Read-StudentDataFile' {
    It 'explains how to create a missing file' {
        { Read-StudentDataFile -Path (Join-Path $TestDrive 'nope.json') } | Should -Throw '*fetch-students.sh*'
    }

    It 'reads the JSON written by fetch-students.sh' {
        $path = Join-Path $TestDrive 'students.json'
        New-TestStudentData -Students @(New-TestStudent 'S1' 'A' 'B') | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $path
        $data = Read-StudentDataFile -Path $path
        $desired = ConvertTo-DesiredStudentState -Data $data -Config (New-TestConfig)
        $desired.Students.Contains('S1') | Should -BeTrue
    }
}
