# Copy to config.psd1 (gitignored) and edit.
@{
    # One entry per tag produced by contacts.sql. Every tag in the data must
    # be listed here or the sync aborts.
    #   Tag                 must match the tag in contacts.sql exactly
    #   MembershipAttribute set to the tag on every contact with this role,
    #                       even if another role is their primary tag.
    #                       CustomAttribute2 to CustomAttribute15, one per tag.
    # CustomAttribute1 always holds the contact's primary (highest-priority)
    # tag and marks the contact as managed by this sync.
    Tags              = @(
        @{ Tag = 'Teacher'; MembershipAttribute = 'CustomAttribute2' }
        @{ Tag = 'Parent'; MembershipAttribute = 'CustomAttribute3' }
    )

    # Abort (unless -Force) if more than this percentage of managed contacts,
    # or of tagged user accounts, would be removed or untagged in one run.
    MaxRemovalPercent = 20

    # Refuse contact data older than this (hours). 0 disables the check.
    MaxDataAgeHours   = 24

    # Log files older than this (days) are deleted at the start of each run.
    LogRetentionDays  = 30

    # Used by setup-lists.ps1. IncludeUserAccounts = $true also sends to the
    # Microsoft 365 accounts the sync tagged (tag_user_account in contacts.sql).
    Lists             = @(
        @{ Name = 'All Teachers'; Alias = 'allteachers'; Tag = 'Teacher'; IncludeUserAccounts = $true }
        @{ Name = 'All Parents'; Alias = 'allparents'; Tag = 'Parent' }
    )

    # Internal mailboxes (or groups) allowed to send to the lists above.
    AllowedSenders    = @(
        'office@example.org'
    )
}
