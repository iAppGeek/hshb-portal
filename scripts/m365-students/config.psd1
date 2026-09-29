# Settings for the student account scripts. Committed: no personal data.
# See README.md for what each setting does.
@{
    # Domain for new student usernames: firstname.lastname@<Domain>.
    Domain                = 'hshb.org.uk'

    # Licence given to new student accounts, and checked on existing ones.
    # Use the SkuPartNumber shown by inventory-m365.ps1. Leave empty to not
    # manage licences (the dry run warns).
    LicenseSkuPartNumber  = 'STANDARDWOFFPACK_STUDENT'

    # Required by Microsoft before a licence can be assigned.
    UsageLocation         = 'GB'

    # CustomAttribute1 = Tag marks an account as managed by these scripts
    # (same convention as ../m365-sync). MembershipAttribute also holds the
    # tag, for a future "All Students" dynamic list. Must not clash with the
    # attributes used in ../m365-sync/config.psd1.
    Tag                   = 'Student'
    MembershipAttribute   = 'CustomAttribute4'

    # classes.year_group values (case-insensitive). A student needs an account
    # if any of their current classes is in EligibleYearGroups. Every year
    # group in the data must be in one of the two lists, or -Apply refuses to
    # run.
    EligibleYearGroups    = @('3', '4', '5', '6', 'GCSE', 'A Level')
    IgnoredYearGroups     = @('pre-school', '1', '2', 'All', 'Test')

    # Teams. In the formats: {0} = the class's Team name, {1} = year code
    # ('2026-27'), {2} = long year ('2026-2027').
    # A class's Team name is its portal class name, unless mapped here.
    ClassTeamNames          = @{
        'GCSE I'   = 'GCSE1'
        'GCSE II'  = 'GCSE2'
        'GCSE III' = 'GCSE3'
    }
    # Display name, e.g. 'Year 3 - 2026-2027'.
    ClassTeamNameFormat     = '{0} - {2}'
    # Teams are found by mail nickname: {0} here is the Team name in lowercase
    # letters and digits only, e.g. 'year3-2026-2027', 'gcse1-2026-2027'.
    # Matches the Teams made by hand for 2026-27, so they are adopted. Must
    # include the year so each year gets new Teams.
    ClassTeamNicknameFormat = '{0}-{2}'

    # The year-wide group for all Year 3+ students, e.g. 'HSHB Student 2026-2027'.
    YearTeamNameFormat      = 'HSHB Student {2}'
    YearTeamNicknameFormat  = 'students-{2}'
    # $false: a plain Microsoft 365 group (like 'HSHB Student 2025-2026');
    # $true: also a Team.
    YearTeamIsTeam          = $false

    # Owners added to every Team setup-teams.ps1 creates or checks (user
    # accounts, not shared mailboxes). Class Teams also get the class
    # teacher; the year group also gets whoever runs setup-teams.ps1 when it
    # creates it. Usually empty.
    DefaultTeamOwners     = @()

    # Group ids of Teams from before these scripts (e.g. last year's student
    # Team). Used only to prefer their members when matching existing
    # accounts by name. Never changed.
    LegacyStudentTeamIds  = @(
        '39b37452-0e23-4c7d-95ee-c8d73690f35e' # HSHB Student 2025-2026
    )

    # Abort (unless -Force) if more than this percentage of managed Team
    # memberships would be removed in one run.
    MaxTeamRemovalPercent = 20

    # Refuse student data (and team-change files) older than this (hours).
    MaxDataAgeHours       = 24

    # Log files older than this (days) are deleted at the start of each run.
    LogRetentionDays      = 30
}
