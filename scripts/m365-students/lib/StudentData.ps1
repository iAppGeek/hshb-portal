#Requires -Version 7.2
# Reads the student data file written by fetch-students.sh and works out who
# needs an account and which Teams they belong in. The file is the contract
# between "fetch data" and "compare with Microsoft 365": any other producer
# (e.g. a portal job) only has to write the same JSON.

Set-StrictMode -Version Latest

function Read-StudentDataFile {
    [OutputType([object])]
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Student data not found: $Path. Run ./fetch-students.sh first."
    }
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -AsHashtable -DateKind String
}

function Get-CodeKey {
    <# Student codes are compared case-insensitively and trimmed. #>
    [OutputType([string])]
    param([AllowNull()][AllowEmptyString()][string]$Code)

    if ([string]::IsNullOrWhiteSpace($Code)) { return '' }
    return $Code.Trim().ToUpperInvariant()
}

function Get-ClassTeamBaseName {
    <# The Team name for a class: ClassTeamNames override (e.g. 'GCSE I' -> 'GCSE1'), or the class name. #>
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$ClassName,
        [Parameter(Mandatory)][hashtable]$Config
    )
    if ($Config.ContainsKey('ClassTeamNames') -and $Config.ClassTeamNames) {
        foreach ($key in $Config.ClassTeamNames.Keys) {
            if (([string]$key).Trim() -ieq $ClassName.Trim()) { return ([string]$Config.ClassTeamNames[$key]).Trim() }
        }
    }
    return $ClassName.Trim()
}

function Format-TeamNickname {
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$Format,
        [AllowEmptyString()][string]$Slug,
        [Parameter(Mandatory)][string]$YearCode
    )
    $nickname = [string]::Format($Format, $Slug, $YearCode, (Get-LongYearCode $YearCode)).ToLowerInvariant()
    if ($nickname -cnotmatch '^[a-z0-9][a-z0-9.-]*$' -or $nickname.Length -gt 64) {
        throw "Team mail nickname '$nickname' is not valid (lowercase letters, digits, dots and hyphens, up to 64)."
    }
    return $nickname
}

function Get-ClassTeamNickname {
    <# e.g. 'Year 3' in 2026-27 -> 'year3-2026-2027' with the default format. #>
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$ClassName,
        [Parameter(Mandatory)][string]$YearCode,
        [Parameter(Mandatory)][hashtable]$Config
    )
    $slug = ((Get-ClassTeamBaseName -ClassName $ClassName -Config $Config).ToLowerInvariant() -replace '[^a-z0-9]', '')
    if (-not $slug) { throw "Class '$ClassName' has no letters or digits for a Team nickname: add it to ClassTeamNames in config.psd1." }
    return Format-TeamNickname -Format ([string]$Config.ClassTeamNicknameFormat) -Slug $slug -YearCode $YearCode
}

function Get-YearTeamNickname {
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$YearCode,
        [Parameter(Mandatory)][hashtable]$Config
    )
    return Format-TeamNickname -Format ([string]$Config.YearTeamNicknameFormat) -Slug '' -YearCode $YearCode
}

function ConvertTo-DesiredStudentState {
    <#
      Pure function. Validates the data file and returns:
        AcademicYear   : { Id, Code }
        YearTeam       : { Nickname, DisplayName }
        Classes        : map class id -> { Id, Name, YearGroup, Eligibility, TeacherEmail, Nickname, DisplayName }
        Students       : ordered map CODE -> student who needs an account
                         { Id, Code, FirstName, LastName, DisplayName, YearGroups, Department, ClassIds, TeamNicknames }
        NoCode         : eligible students with no student code (no account can be linked)
        NoClass        : active students with no current class
        Undetermined   : students whose only classes are in unknown year groups
        NotEligibleCodes / InactiveCodes : sets of CODE
        UnknownYearGroups : year group values in neither config list
        Skipped, Counts
      Throws on anything that could make the sync act on bad data.
    #>
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][System.Collections.IDictionary]$Data,
        [Parameter(Mandatory)][hashtable]$Config,
        [AllowNull()][object]$Now,
        [double]$MaxAgeHours = 0
    )

    if ($Data['version'] -ne 1) { throw "Unsupported student data version '$($Data['version'])'." }
    foreach ($key in @('students', 'classes', 'academicYear')) {
        if ($null -eq $Data[$key]) { throw "Student data is missing '$key'. Run ./fetch-students.sh again." }
    }
    if ([int]$Data['currentYearCount'] -ne 1) {
        throw "Expected exactly one current academic year, found $($Data['currentYearCount']). Fix academic_years.is_current in the portal."
    }
    $yearCode = [string]$Data['academicYear']['code']
    if ($yearCode -notmatch '^\d{4}-\d{2}$') { throw "Academic year code '$yearCode' is not in the form 2026-27." }

    if ($MaxAgeHours -gt 0) {
        $generated = [datetimeoffset]::Parse([string]$Data['generatedAt'], [cultureinfo]::InvariantCulture)
        $current = if ($null -ne $Now) { [datetimeoffset]$Now } else { [datetimeoffset]::Now }
        $age = ($current - $generated).TotalHours
        if ($age -gt $MaxAgeHours) {
            throw ("Student data is {0:N1} hours old (limit {1}). Run ./fetch-students.sh again." -f $age, $MaxAgeHours)
        }
    }
    if (@($Data['students']).Count -eq 0) { throw 'Student data has no students. Aborting without changes.' }

    $yearTeam = [pscustomobject]@{
        Nickname    = Get-YearTeamNickname -YearCode $yearCode -Config $Config
        DisplayName = [string]::Format([string]$Config.YearTeamNameFormat, '', $yearCode, (Get-LongYearCode $yearCode))
    }

    # Classes, with eligibility from config.psd1.
    $classes = @{}
    $nicknames = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $unknownYearGroups = [System.Collections.Generic.SortedSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($c in @($Data['classes'])) {
        $id = [string]$c['id']
        if ($classes.ContainsKey($id)) { throw 'Student data lists a class twice. Run ./fetch-students.sh again.' }
        $yearGroup = ([string]$c['yearGroup']).Trim()
        $eligibility = Get-YearGroupEligibility -YearGroup $yearGroup -Config $Config
        if ($eligibility -eq 'Unknown') { [void]$unknownYearGroups.Add($yearGroup) }
        $name = ([string]$c['name']).Trim()
        # Only classes in eligible year groups get a Team.
        $nickname = ''
        if ($eligibility -eq 'Eligible') {
            $nickname = Get-ClassTeamNickname -ClassName $name -YearCode $yearCode -Config $Config
            if ($nickname -eq $yearTeam.Nickname -or -not $nicknames.Add($nickname)) {
                throw "Two Teams would share the mail nickname $nickname. Rename a class, or map it in ClassTeamNames in config.psd1."
            }
        }
        $classes[$id] = [pscustomobject]@{
            Id           = $id
            Name         = $name
            YearGroup    = $yearGroup
            Eligibility  = $eligibility
            TeacherEmail = if ($c['teacherEmail']) { ([string]$c['teacherEmail']).Trim().ToLowerInvariant() } else { '' }
            Nickname     = $nickname
            DisplayName  = [string]::Format([string]$Config.ClassTeamNameFormat, (Get-ClassTeamBaseName -ClassName $name -Config $Config), $yearCode, (Get-LongYearCode $yearCode))
        }
    }

    # Order year groups as they are listed in EligibleYearGroups.
    $eligibleOrder = @($Config.EligibleYearGroups | ForEach-Object { ([string]$_).Trim() })

    $students = [ordered]@{}
    $noCode = [System.Collections.Generic.List[object]]::new()
    $noClass = [System.Collections.Generic.List[object]]::new()
    $undetermined = [System.Collections.Generic.List[object]]::new()
    $notEligible = [System.Collections.Generic.HashSet[string]]::new()
    $ids = [System.Collections.Generic.HashSet[string]]::new()
    $codes = [System.Collections.Generic.HashSet[string]]::new()

    foreach ($s in @($Data['students'])) {
        $id = [string]$s['id']
        if (-not $ids.Add($id)) { throw 'Student data lists a student twice. Run ./fetch-students.sh again.' }
        $key = Get-CodeKey ([string]$s['code'])
        if ($key -and -not $codes.Add($key)) {
            throw 'Two active students share a student code (ignoring case). Fix the codes in the portal.'
        }
        $first = ([string]$s['firstName']).Trim()
        $last = ([string]$s['lastName']).Trim()
        $summary = [pscustomobject]@{ Id = $id; Code = if ($key) { ([string]$s['code']).Trim() } else { '' }; FirstName = $first; LastName = $last; DisplayName = "$first $last" }

        $studentClasses = foreach ($classId in @($s['classIds'])) {
            if ($null -eq $classId) { continue }
            if (-not $classes.ContainsKey([string]$classId)) { throw 'A student is enrolled in a class missing from the data. Run ./fetch-students.sh again.' }
            $classes[[string]$classId]
        }
        $studentClasses = @($studentClasses)
        if ($studentClasses.Count -eq 0) { $noClass.Add($summary); continue }

        $eligibleClasses = @($studentClasses | Where-Object Eligibility -eq 'Eligible')
        if ($eligibleClasses.Count -eq 0) {
            if (@($studentClasses | Where-Object Eligibility -eq 'Unknown').Count -gt 0) { $undetermined.Add($summary) }
            elseif ($key) { [void]$notEligible.Add($key) }
            continue
        }
        if (-not $key) { $noCode.Add($summary); continue }

        $yearGroups = @(foreach ($g in $eligibleOrder) {
                if (@($eligibleClasses | Where-Object { $_.YearGroup -ieq $g }).Count -gt 0) { $g }
            })
        $students[$key] = [pscustomobject]@{
            Id            = $id
            Code          = $summary.Code
            FirstName     = $first
            LastName      = $last
            DisplayName   = $summary.DisplayName
            YearGroups    = $yearGroups
            Department    = ($yearGroups | ForEach-Object { if ($_ -match '^\d+$') { "Year $_" } else { $_ } }) -join ', '
            ClassIds      = @($eligibleClasses | ForEach-Object Id)
            TeamNicknames = @($yearTeam.Nickname) + @($eligibleClasses | ForEach-Object Nickname)
        }
    }

    $inactive = [System.Collections.Generic.HashSet[string]]::new()
    foreach ($code in @($Data['inactiveCodes'])) {
        $key = Get-CodeKey ([string]$code)
        # A code reused by an active student belongs to the active student.
        if ($key -and -not $codes.Contains($key)) { [void]$inactive.Add($key) }
    }

    $skipped = @(@($Data['skipped']) | Where-Object { $_ } | ForEach-Object { [pscustomobject]$_ })

    return @{
        AcademicYear      = [pscustomobject]@{ Id = [string]$Data['academicYear']['id']; Code = $yearCode }
        YearTeam          = $yearTeam
        Classes           = $classes
        Students          = $students
        NoCode            = $noCode.ToArray()
        NoClass           = $noClass.ToArray()
        Undetermined      = $undetermined.ToArray()
        NotEligibleCodes  = $notEligible
        InactiveCodes     = $inactive
        UnknownYearGroups = @($unknownYearGroups)
        Skipped           = $skipped
        Counts            = [pscustomobject]@{
            Active       = $ids.Count
            Eligible     = $students.Count + $noCode.Count
            NotEligible  = $ids.Count - $students.Count - $noCode.Count - $noClass.Count - $undetermined.Count
            NoCode       = $noCode.Count
            NoClass      = $noClass.Count
            Undetermined = $undetermined.Count
        }
    }
}
