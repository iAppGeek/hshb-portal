# Settings for the student account scripts. Committed: no personal data.
# See README.md for what each setting does.
@{
    # Domain for new student usernames: firstname.lastname@<Domain>.
    Domain                = 'hshb.org.uk'

    # Licence given to new student accounts, and checked on existing ones.
    # Use the SkuPartNumber shown by inventory-m365.ps1 (e.g. 'STANDARDWOFFPACK_STUDENT').
    # Leave empty to not manage licences (the dry run warns).
    LicenseSkuPartNumber  = ''

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

    # Team display names. {0} = class name, {1} = academic year code.
    ClassTeamNameFormat   = '{0} {1}'
    # {0} = academic year code.
    YearTeamNameFormat    = 'Students {0}'
    # Teams are identified by mailNickname: <prefix>class-<8 chars of class id>
    # and <prefix>year-<year code>. Don't change once Teams exist.
    TeamNicknamePrefix    = 'stu-'

    # Owners added to every Team setup-teams.ps1 creates (user accounts, not
    # shared mailboxes). The class teacher is added as well when found.
    DefaultTeamOwners     = @()

    # Group ids of Teams from before these scripts (e.g. last year's student
    # Team). Used only to prefer their members when matching existing
    # accounts by name. Never changed.
    LegacyStudentTeamIds  = @()

    # Abort (unless -Force) if more than this percentage of managed Team
    # memberships would be removed in one run.
    MaxTeamRemovalPercent = 20

    # Refuse student data (and team-change files) older than this (hours).
    MaxDataAgeHours       = 24

    # Log files older than this (days) are deleted at the start of each run.
    LogRetentionDays      = 30
}
