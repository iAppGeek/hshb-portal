#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
# Run: pwsh -c "Invoke-Pester ./tests"

BeforeAll {
    $root = Split-Path -Parent $PSScriptRoot
    . (Join-Path $root 'lib/Common.ps1')
    . (Join-Path $root 'lib/ContactData.ps1')
    . (Join-Path $root 'lib/Exchange.ps1')

    function New-TestConfig {
        return @{
            Tags              = @(
                @{ Tag = 'Teacher'; MembershipAttribute = 'CustomAttribute2' }
                @{ Tag = 'Parent'; MembershipAttribute = 'CustomAttribute3' }
            )
            MaxRemovalPercent = 20
        }
    }

    function New-TestData {
        param([object[]]$Contacts, [object[]]$Accounts = @())
        return @{
            version     = 1
            generatedAt = '2026-09-17T10:00:00+00:00'
            roles       = @(@{ tag = 'Teacher'; rows = 1 }, @{ tag = 'Parent'; rows = 1 })
            contacts    = $Contacts
            accounts    = $Accounts
            skipped     = @(@{ role = 'Parent'; reason = 'missing email'; count = 2 })
            mergedRows  = 0
        }
    }

    function New-TestContact {
        param([string]$Email, [string]$First, [string]$Last, [string[]]$Tags)
        return @{ email = $Email; firstName = $First; lastName = $Last; tags = $Tags }
    }

    function New-ExchangeContact {
        param([string]$Email, [string]$First, [string]$Last, [hashtable]$Attributes = @{}, [bool]$Hidden = $true)
        $all = @{}
        foreach ($n in 1..15) { $all["CustomAttribute$n"] = '' }
        foreach ($k in $Attributes.Keys) { $all[$k] = $Attributes[$k] }
        return [pscustomobject]@{
            Id = [guid]::NewGuid().ToString(); Name = "$First $Last"; Email = $Email
            DisplayName = "$First $Last"; FirstName = $First; LastName = $Last; Hidden = $Hidden; Attributes = $all
        }
    }

    function New-ExchangeRecipient {
        param([string]$Email, [string]$Type = 'UserMailbox', [hashtable]$Attributes = @{}, [string]$Name = 'Someone')
        $all = @{}
        foreach ($n in 1..15) { $all["CustomAttribute$n"] = '' }
        foreach ($k in $Attributes.Keys) { $all[$k] = $Attributes[$k] }
        return [pscustomobject]@{
            Id = [guid]::NewGuid().ToString(); Name = $Name; RecipientTypeDetails = $Type
            PrimaryEmail = $Email; Emails = @($Email); Attributes = $all
        }
    }

    function Get-Desired {
        param([object[]]$Contacts, [object[]]$Accounts = @())
        return ConvertTo-DesiredState -Data (New-TestData -Contacts $Contacts -Accounts $Accounts) -Config (New-TestConfig)
    }

    # Simulates applying a plan to the in-memory state, to test idempotency.
    function Update-StateFromPlan {
        param([hashtable]$State, [hashtable]$Plan)
        $contacts = [System.Collections.Generic.List[object]]::new()
        $removed = @($Plan.Removals | ForEach-Object Id)
        foreach ($c in $State.Contacts) { if ($removed -notcontains $c.Id) { $contacts.Add($c) } }
        foreach ($u in $Plan.Updates) {
            $c = $contacts | Where-Object Id -EQ $u.Id
            foreach ($k in $u.ContactChanges.Keys) { $c.$k = $u.ContactChanges[$k].To }
            foreach ($k in $u.MailContactChanges.Keys) {
                switch -Regex ($k) {
                    '^CustomAttribute' { $c.Attributes[$k] = $u.MailContactChanges[$k].To }
                    '^HiddenFromAddressListsEnabled$' { $c.Hidden = $true }
                    default { $c.$k = $u.MailContactChanges[$k].To }
                }
            }
        }
        foreach ($a in $Plan.Adds) {
            $new = New-ExchangeContact -Email $a.Email -First $a.FirstName -Last $a.LastName -Attributes @{}
            $new.DisplayName = $a.DisplayName; $new.Name = $a.Name
            foreach ($k in $a.Attributes.Keys) { $new.Attributes[$k] = $a.Attributes[$k] }
            $contacts.Add($new)
        }
        foreach ($ac in $Plan.AccountChanges) {
            $r = $State.Recipients | Where-Object Id -EQ $ac.Id
            foreach ($k in $ac.Changes.Keys) { $r.Attributes[$k] = $ac.Changes[$k].To }
        }
        return @{ Contacts = $contacts.ToArray(); Recipients = $State.Recipients }
    }
}

Describe 'Get-NormalisedEmail / Test-EmailAddress / Protect-Email' {
    It 'trims and lowercases' {
        Get-NormalisedEmail '  Jane.Doe@Example.COM ' | Should -Be 'jane.doe@example.com'
    }
    It 'returns null for blank values' {
        Get-NormalisedEmail '   ' | Should -BeNullOrEmpty
    }
    It 'accepts valid and rejects invalid addresses' {
        Test-EmailAddress 'a.b+c@mail.example.co.uk' | Should -BeTrue
        foreach ($bad in @('', 'no-at-sign', 'a@b', 'a b@example.com', 'a..b@example.com', '.a@example.com', 'a@@example.com')) {
            Test-EmailAddress $bad | Should -BeFalse -Because $bad
        }
    }
    It 'masks the local part' {
        Protect-Email 'jane@example.com' | Should -Be 'j***@example.com'
        Protect-Email $null | Should -Be '***'
    }
}

Describe 'Assert-SyncConfig' {
    It 'accepts the committed config' {
        $example = Import-PowerShellDataFile (Join-Path (Split-Path -Parent $PSScriptRoot) 'config.psd1')
        { Assert-SyncConfig -Config $example } | Should -Not -Throw
    }
    It 'rejects CustomAttribute1 as a membership attribute' {
        $config = New-TestConfig
        $config.Tags[0].MembershipAttribute = 'CustomAttribute1'
        { Assert-SyncConfig -Config $config } | Should -Throw '*reserved*'
    }
    It 'rejects tags with characters unsafe for filters' {
        $config = New-TestConfig
        $config.Tags[0].Tag = "Teach'er"
        { Assert-SyncConfig -Config $config } | Should -Throw '*letters and digits*'
    }
    It 'rejects two tags sharing an attribute' {
        $config = New-TestConfig
        $config.Tags[1].MembershipAttribute = 'CustomAttribute2'
        { Assert-SyncConfig -Config $config } | Should -Throw '*share*'
    }
}

Describe 'ConvertTo-DesiredState' {
    It 'builds contacts with normalised emails and display names' {
        $desired = Get-Desired -Contacts @(New-TestContact ' Jane@Example.com ' 'Jane' 'Doe' @('Teacher'))
        $desired.Contacts.Keys | Should -Be @('jane@example.com')
        $desired.Contacts['jane@example.com'].DisplayName | Should -Be 'Jane Doe'
        $desired.Skipped.Count | Should -Be 1
    }
    It 'keeps tag order from the data (priority)' {
        $desired = Get-Desired -Contacts @(New-TestContact 'a@example.com' 'A' 'B' @('Teacher', 'Parent'))
        @($desired.Contacts['a@example.com'].Tags) | Should -Be @('Teacher', 'Parent')
    }
    It 'skips invalid emails and counts them' {
        $desired = Get-Desired -Contacts @(
            New-TestContact 'ok@example.com' 'A' 'B' @('Parent')
            New-TestContact 'not-an-email' 'C' 'D' @('Parent')
        )
        $desired.Contacts.Count | Should -Be 1
        @($desired.Skipped | Where-Object reason -Like 'invalid*').Count | Should -Be 1
    }
    It 'aborts on an unknown tag' {
        $data = New-TestData -Contacts @(New-TestContact 'a@example.com' 'A' 'B' @('Parent'))
        $data.roles += @{ tag = 'Governor'; rows = 3 }
        { ConvertTo-DesiredState -Data $data -Config (New-TestConfig) } | Should -Throw '*not defined in config*'
    }
    It 'aborts when a role returned 0 rows' {
        $data = New-TestData -Contacts @(New-TestContact 'a@example.com' 'A' 'B' @('Parent'))
        $data.roles[0].rows = 0
        { ConvertTo-DesiredState -Data $data -Config (New-TestConfig) } | Should -Throw '*0 rows*'
    }
    It 'aborts when there are no contacts' {
        { ConvertTo-DesiredState -Data (New-TestData -Contacts @()) -Config (New-TestConfig) } | Should -Throw '*no contacts*'
    }
    It 'aborts on duplicate emails' {
        $data = New-TestData -Contacts @(
            New-TestContact 'a@example.com' 'A' 'B' @('Parent')
            New-TestContact 'A@example.com' 'A' 'B' @('Parent')
        )
        { ConvertTo-DesiredState -Data $data -Config (New-TestConfig) } | Should -Throw '*duplicate*'
    }
    It 'aborts on stale data' {
        $data = New-TestData -Contacts @(New-TestContact 'a@example.com' 'A' 'B' @('Parent'))
        $now = [datetimeoffset]::Parse('2026-09-18T12:00:00+00:00')
        { ConvertTo-DesiredState -Data $data -Config (New-TestConfig) -MaxAgeHours 24 -Now $now } | Should -Throw '*hours old*'
        { ConvertTo-DesiredState -Data $data -Config (New-TestConfig) -MaxAgeHours 48 -Now $now } | Should -Not -Throw
    }
}

Describe 'New-SyncPlan' {
    It 'adds missing contacts with primary tag, membership attributes and a unique name' {
        $desired = Get-Desired -Contacts @(New-TestContact 'jane@example.com' 'Jane' 'Doe' @('Teacher', 'Parent'))
        $state = @{ Contacts = @(); Recipients = @(New-ExchangeRecipient -Email 'x@school.org' -Name 'Jane Doe') }
        $plan = New-SyncPlan -Desired $desired -State $state -Config (New-TestConfig)

        $plan.Adds.Count | Should -Be 1
        $add = $plan.Adds[0]
        $add.Name | Should -Be 'Jane Doe (2)'
        $add.Attributes.CustomAttribute1 | Should -Be 'Teacher'
        $add.Attributes.CustomAttribute2 | Should -Be 'Teacher'
        $add.Attributes.CustomAttribute3 | Should -Be 'Parent'
    }

    It 'adopts an untagged existing contact with the same email instead of duplicating it' {
        $desired = Get-Desired -Contacts @(New-TestContact 'jane@example.com' 'Jane' 'Doe' @('Teacher'))
        $existing = New-ExchangeContact -Email 'jane@example.com' -First 'Jane' -Last 'Doe' -Hidden $false
        $plan = New-SyncPlan -Desired $desired -State @{ Contacts = @($existing); Recipients = @() } -Config (New-TestConfig)

        $plan.Adds.Count | Should -Be 0
        $plan.Updates.Count | Should -Be 1
        $plan.Updates[0].Adopted | Should -BeTrue
        $plan.Updates[0].MailContactChanges.Keys | Should -Contain 'CustomAttribute1'
        $plan.Updates[0].MailContactChanges.Keys | Should -Contain 'HiddenFromAddressListsEnabled'
    }

    It 'updates changed names' {
        $desired = Get-Desired -Contacts @(New-TestContact 'jane@example.com' 'Jane' 'Smith' @('Parent'))
        $existing = New-ExchangeContact -Email 'jane@example.com' -First 'Jane' -Last 'Doe' -Attributes @{ CustomAttribute1 = 'Parent'; CustomAttribute3 = 'Parent' }
        $plan = New-SyncPlan -Desired $desired -State @{ Contacts = @($existing); Recipients = @() } -Config (New-TestConfig)

        $plan.Updates[0].ContactChanges.LastName.To | Should -Be 'Smith'
        $plan.Updates[0].MailContactChanges.DisplayName.To | Should -Be 'Jane Smith'
        $plan.Updates[0].Adopted | Should -BeFalse
    }

    It 'clears a membership attribute when a role is lost' {
        $desired = Get-Desired -Contacts @(New-TestContact 'jane@example.com' 'Jane' 'Doe' @('Parent'))
        $existing = New-ExchangeContact -Email 'jane@example.com' -First 'Jane' -Last 'Doe' -Attributes @{ CustomAttribute1 = 'Teacher'; CustomAttribute2 = 'Teacher'; CustomAttribute3 = 'Parent' }
        $plan = New-SyncPlan -Desired $desired -State @{ Contacts = @($existing); Recipients = @() } -Config (New-TestConfig)

        $plan.Updates[0].MailContactChanges.CustomAttribute1.To | Should -Be 'Parent'
        $plan.Updates[0].MailContactChanges.CustomAttribute2.To | Should -Be ''
    }

    It 'removes only tagged contacts that are no longer wanted and never touches untagged ones' {
        $desired = Get-Desired -Contacts @(1..10 | ForEach-Object { New-TestContact "p$_@example.com" 'P' "$_" @('Parent') })
        $kept = 1..10 | ForEach-Object { New-ExchangeContact -Email "p$_@example.com" -First 'P' -Last "$_" -Attributes @{ CustomAttribute1 = 'Parent'; CustomAttribute3 = 'Parent' } }
        $gone = New-ExchangeContact -Email 'old@example.com' -First 'Old' -Last 'Parent' -Attributes @{ CustomAttribute1 = 'Parent' }
        $untagged = New-ExchangeContact -Email 'plumber@example.com' -First 'The' -Last 'Plumber'
        $other = New-ExchangeContact -Email 'other@example.com' -First 'Other' -Last 'Tag' -Attributes @{ CustomAttribute1 = 'Supplier' }
        $state = @{ Contacts = @($kept) + @($gone, $untagged, $other); Recipients = @() }
        $plan = New-SyncPlan -Desired $desired -State $state -Config (New-TestConfig)

        @($plan.Removals | ForEach-Object Email) | Should -Be @('old@example.com')
        $plan.Updates.Count | Should -Be 0
        $plan.RemovalGuardTripped | Should -BeFalse
    }

    It 'trips the guard when removals exceed the threshold' {
        $desired = Get-Desired -Contacts @(New-TestContact 'p1@example.com' 'P' '1' @('Parent'))
        $contacts = 1..5 | ForEach-Object { New-ExchangeContact -Email "p$_@example.com" -First 'P' -Last "$_" -Attributes @{ CustomAttribute1 = 'Parent'; CustomAttribute3 = 'Parent' } }
        $plan = New-SyncPlan -Desired $desired -State @{ Contacts = @($contacts); Recipients = @() } -Config (New-TestConfig)

        $plan.Removals.Count | Should -Be 4
        $plan.ContactRemovalPercent | Should -Be 80
        $plan.RemovalGuardTripped | Should -BeTrue
    }

    It 'reports a conflict when the address belongs to an internal recipient' {
        $desired = Get-Desired -Contacts @(New-TestContact 'guest@example.com' 'G' 'Uest' @('Teacher'))
        $state = @{ Contacts = @(); Recipients = @(New-ExchangeRecipient -Email 'guest@example.com' -Type 'GuestMailUser') }
        $plan = New-SyncPlan -Desired $desired -State $state -Config (New-TestConfig)

        $plan.Adds.Count | Should -Be 0
        $plan.Conflicts.Count | Should -Be 1
    }

    It 'tags teacher accounts, skips unknown ones and untags accounts no longer wanted' {
        $desired = Get-Desired -Contacts @(New-TestContact 'jane@example.com' 'Jane' 'Doe' @('Teacher')) -Accounts @(
            @{ email = 'jane@school.org'; tag = 'Teacher' }
            @{ email = 'missing@school.org'; tag = 'Teacher' }
        )
        $teacher = @{ CustomAttribute1 = 'Teacher'; CustomAttribute2 = 'Teacher' }
        $jane = New-ExchangeRecipient -Email 'jane@school.org' -Attributes @{ CustomAttribute5 = 'Payroll' }
        $former = New-ExchangeRecipient -Email 'former@school.org' -Attributes $teacher
        $untouched = New-ExchangeRecipient -Email 'office@school.org' -Attributes @{ CustomAttribute1 = 'Finance'; CustomAttribute2 = 'Other' }
        $others = 1..4 | ForEach-Object { New-ExchangeRecipient -Email "t$_@school.org" -Attributes $teacher.Clone() }
        1..4 | ForEach-Object { $desired.Accounts["t$_@school.org"] = 'Teacher' }
        $state = @{ Contacts = @(); Recipients = @($jane, $former, $untouched) + @($others) }
        $plan = New-SyncPlan -Desired $desired -State $state -Config (New-TestConfig)

        $janeChange = $plan.AccountChanges | Where-Object Email -EQ 'jane@school.org'
        $janeChange.Changes.CustomAttribute1.To | Should -Be 'Teacher'
        $janeChange.Changes.CustomAttribute2.To | Should -Be 'Teacher'
        $janeChange.Changes.Keys | Should -Not -Contain 'CustomAttribute5'
        $janeChange.Changes.Keys | Should -Not -Contain 'CustomAttribute3'

        $formerChange = $plan.AccountChanges | Where-Object Email -EQ 'former@school.org'
        $formerChange.Changes.CustomAttribute1.To | Should -Be ''
        $formerChange.Changes.CustomAttribute2.To | Should -Be ''

        @($plan.AccountChanges | Where-Object Email -EQ 'office@school.org').Count | Should -Be 0
        @($plan.AccountChanges | Where-Object Email -Like 't*@school.org').Count | Should -Be 0
        @($plan.AccountSkips | ForEach-Object Email) | Should -Be @('missing@school.org')
        $plan.RemovalGuardTripped | Should -BeFalse
    }

    It 'adds the role attribute to accounts already tagged with CustomAttribute1 only' {
        $desired = Get-Desired -Contacts @(New-TestContact 'jane@example.com' 'Jane' 'Doe' @('Teacher')) -Accounts @(
            @{ email = 'jane@school.org'; tag = 'Teacher' }
        )
        $jane = New-ExchangeRecipient -Email 'jane@school.org' -Attributes @{ CustomAttribute1 = 'Teacher' }
        $plan = New-SyncPlan -Desired $desired -State @{ Contacts = @(); Recipients = @($jane) } -Config (New-TestConfig)

        $plan.AccountChanges.Count | Should -Be 1
        @($plan.AccountChanges[0].Changes.Keys) | Should -Be @('CustomAttribute2')
    }

    It 'is idempotent: a second plan after applying the first has no changes' {
        $desired = Get-Desired -Contacts @(
            New-TestContact 'jane@example.com' 'Jane' 'Doe' @('Teacher', 'Parent')
            New-TestContact 'bob@example.com' 'Bob' 'Jones' @('Parent')
            New-TestContact 'amy@example.com' 'Amy' 'Lee' @('Teacher')
        ) -Accounts @(@{ email = 'jane@school.org'; tag = 'Teacher' })
        $state = @{
            Contacts   = @(
                New-ExchangeContact -Email 'amy@example.com' -First 'Amy' -Last 'L' -Hidden $false
                New-ExchangeContact -Email 'gone@example.com' -First 'Gone' -Last 'Person' -Attributes @{ CustomAttribute1 = 'Parent' }
                1..6 | ForEach-Object { New-ExchangeContact -Email "keep$_@example.com" -First 'K' -Last "$_" }
            )
            Recipients = @(New-ExchangeRecipient -Email 'jane@school.org')
        }
        $first = New-SyncPlan -Desired $desired -State $state -Config (New-TestConfig)
        ($first.Adds.Count + $first.Updates.Count + $first.Removals.Count + $first.AccountChanges.Count) | Should -BeGreaterThan 0

        $after = Update-StateFromPlan -State $state -Plan $first
        $second = New-SyncPlan -Desired $desired -State $after -Config (New-TestConfig)
        ($second.Adds.Count + $second.Updates.Count + $second.Removals.Count + $second.AccountChanges.Count) | Should -Be 0
    }
}

Describe 'Get-UniqueRecipientName' {
    It 'truncates to 64 characters and keeps suffixed names within the limit' {
        $taken = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        $long = 'x' * 80
        $a = Get-UniqueRecipientName -DisplayName $long -TakenNames $taken
        $b = Get-UniqueRecipientName -DisplayName $long -TakenNames $taken
        $a.Length | Should -Be 64
        $b.Length | Should -BeLessOrEqual 64
        $b | Should -BeLike '* (2)'
    }
}
