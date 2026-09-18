#Requires -Version 7.2
# "Apply to Exchange" half of the sync: read current state, work out a plan
# (pure, testable), then carry the plan out.

Set-StrictMode -Version Latest

function Connect-SyncExchange {
    [OutputType([void])]
    param(
        [string]$UserPrincipalName,
        [switch]$Device
    )

    if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement)) {
        throw 'ExchangeOnlineManagement module not installed. Run: Install-Module ExchangeOnlineManagement -Scope CurrentUser'
    }
    Import-Module ExchangeOnlineManagement -ErrorAction Stop

    $existing = Get-ConnectionInformation -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq 'Connected' -and $_.ConnectionUri -like '*outlook.office365.com*' }
    if ($existing) { return }

    $params = @{ ShowBanner = $false }
    if ($UserPrincipalName) { $params.UserPrincipalName = $UserPrincipalName }
    if ($Device) { $params.Device = $true }
    Connect-ExchangeOnline @params
}

function Get-ProxySmtpAddress {
    [OutputType([string])]
    param([AllowNull()][object]$Value)

    if ($null -eq $Value) { return $null }
    return Get-NormalisedEmail (([string]$Value) -replace '^smtp:', '')
}

function Get-ExchangeState {
    <#
      Reads contacts and other recipients and returns plain objects, so the
      planner does not depend on Exchange types.
    #>
    [OutputType([hashtable])]
    param()

    $names = @{}
    foreach ($c in Get-Contact -RecipientTypeDetails MailContact -ResultSize Unlimited) {
        $names[[string]$c.Guid] = $c
    }

    $contacts = foreach ($mc in Get-MailContact -ResultSize Unlimited) {
        $id = [string]$mc.Guid
        $attributes = @{}
        foreach ($n in 1..15) {
            $attributes["CustomAttribute$n"] = ConvertTo-CleanString $mc."CustomAttribute$n"
        }
        [pscustomobject]@{
            Id          = $id
            Name        = [string]$mc.Name
            Email       = Get-ProxySmtpAddress $mc.ExternalEmailAddress
            DisplayName = ConvertTo-CleanString $mc.DisplayName
            FirstName   = ConvertTo-CleanString $(if ($names.ContainsKey($id)) { $names[$id].FirstName })
            LastName    = ConvertTo-CleanString $(if ($names.ContainsKey($id)) { $names[$id].LastName })
            Hidden      = [bool]$mc.HiddenFromAddressListsEnabled
            Attributes  = $attributes
        }
    }

    $recipients = foreach ($r in Get-Recipient -ResultSize Unlimited) {
        if ([string]$r.RecipientTypeDetails -eq 'MailContact') { continue }
        $attributes = @{}
        foreach ($n in 1..15) {
            $attributes["CustomAttribute$n"] = ConvertTo-CleanString $r."CustomAttribute$n"
        }
        [pscustomobject]@{
            Id                   = [string]$r.Guid
            Name                 = [string]$r.Name
            RecipientTypeDetails = [string]$r.RecipientTypeDetails
            PrimaryEmail         = Get-NormalisedEmail ([string]$r.PrimarySmtpAddress)
            Emails               = @($r.EmailAddresses | Where-Object { [string]$_ -match '^smtp:' } |
                    ForEach-Object { Get-ProxySmtpAddress $_ })
            Attributes           = $attributes
        }
    }

    return @{ Contacts = @($contacts); Recipients = @($recipients) }
}

function Get-UniqueRecipientName {
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][AllowEmptyCollection()][System.Collections.Generic.HashSet[string]]$TakenNames
    )

    $base = if ($DisplayName.Length -gt 64) { $DisplayName.Substring(0, 64).Trim() } else { $DisplayName }
    $candidate = $base
    $n = 2
    while ($TakenNames.Contains($candidate)) {
        $suffix = " ($n)"
        $candidate = $base.Substring(0, [Math]::Min($base.Length, 64 - $suffix.Length)).Trim() + $suffix
        $n++
    }
    [void]$TakenNames.Add($candidate)
    return $candidate
}

function New-SyncPlan {
    <#
      Pure function: compares the desired state with Exchange and returns the
      changes to make. Only contacts whose CustomAttribute1 is one of our tags
      are ever removed; untagged contacts are only touched when they match a
      desired email (adoption).
    #>
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][hashtable]$Desired,
        [Parameter(Mandatory)][hashtable]$State,
        [Parameter(Mandatory)][hashtable]$Config
    )

    $roles = @($Config.Tags)
    $tags = @($roles | ForEach-Object { $_.Tag })
    # Any of our tags on a user account is treated as managed by this sync.
    $accountTags = $tags

    $contactsByEmail = @{}
    foreach ($c in $State.Contacts) { if ($c.Email) { $contactsByEmail[$c.Email] = $c } }

    $recipientsByEmail = @{}
    foreach ($r in $State.Recipients) {
        foreach ($address in @($r.Emails) + @($r.PrimaryEmail)) {
            if ($address -and -not $recipientsByEmail.ContainsKey($address)) { $recipientsByEmail[$address] = $r }
        }
    }

    $takenNames = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($x in @($State.Contacts) + @($State.Recipients)) { if ($x.Name) { [void]$takenNames.Add($x.Name) } }

    $adds = [System.Collections.Generic.List[object]]::new()
    $updates = [System.Collections.Generic.List[object]]::new()
    $removals = [System.Collections.Generic.List[object]]::new()
    $conflicts = [System.Collections.Generic.List[object]]::new()

    foreach ($person in $Desired.Contacts.Values) {
        $primaryTag = $person.Tags[0]
        $wantedAttributes = [ordered]@{ CustomAttribute1 = $primaryTag }
        foreach ($role in $roles) {
            $wantedAttributes[$role.MembershipAttribute] = if ($person.Tags -contains $role.Tag) { $role.Tag } else { '' }
        }

        if ($contactsByEmail.ContainsKey($person.Email)) {
            $existing = $contactsByEmail[$person.Email]
            $contactChanges = [ordered]@{}
            $mailContactChanges = [ordered]@{}
            foreach ($field in @('FirstName', 'LastName')) {
                if ($existing.$field -cne $person.$field) {
                    $contactChanges[$field] = @{ From = $existing.$field; To = $person.$field }
                }
            }
            if ($existing.DisplayName -cne $person.DisplayName) {
                $mailContactChanges.DisplayName = @{ From = $existing.DisplayName; To = $person.DisplayName }
            }
            foreach ($attribute in $wantedAttributes.Keys) {
                if ($existing.Attributes[$attribute] -cne $wantedAttributes[$attribute]) {
                    $mailContactChanges[$attribute] = @{ From = $existing.Attributes[$attribute]; To = $wantedAttributes[$attribute] }
                }
            }
            if (-not $existing.Hidden) {
                $mailContactChanges.HiddenFromAddressListsEnabled = @{ From = $false; To = $true }
            }
            if ($contactChanges.Count + $mailContactChanges.Count -gt 0) {
                $updates.Add([pscustomobject]@{
                        Id                 = $existing.Id
                        Email              = $person.Email
                        DisplayName        = $person.DisplayName
                        PrimaryTag         = $primaryTag
                        Adopted            = $tags -notcontains $existing.Attributes.CustomAttribute1
                        ContactChanges     = $contactChanges
                        MailContactChanges = $mailContactChanges
                    })
            }
            continue
        }

        if ($recipientsByEmail.ContainsKey($person.Email)) {
            $conflicts.Add([pscustomobject]@{
                    Email       = $person.Email
                    DisplayName = $person.DisplayName
                    PrimaryTag  = $primaryTag
                    Reason      = "address already belongs to a $($recipientsByEmail[$person.Email].RecipientTypeDetails)"
                })
            continue
        }

        $adds.Add([pscustomobject]@{
                Email       = $person.Email
                Name        = Get-UniqueRecipientName -DisplayName $person.DisplayName -TakenNames $takenNames
                DisplayName = $person.DisplayName
                FirstName   = $person.FirstName
                LastName    = $person.LastName
                PrimaryTag  = $primaryTag
                Attributes  = $wantedAttributes
            })
    }

    $managed = @($State.Contacts | Where-Object { $tags -contains $_.Attributes.CustomAttribute1 })
    foreach ($c in $managed) {
        if (-not $Desired.Contacts.Contains([string]$c.Email)) {
            $removals.Add([pscustomobject]@{
                    Id = $c.Id; Email = $c.Email; DisplayName = $c.DisplayName; PrimaryTag = $c.Attributes.CustomAttribute1
                })
        }
    }

    # User accounts (e.g. teachers' school mailboxes): CustomAttribute1 and the
    # role's membership attribute, so lists can include the account too. Other
    # role attributes on an account are cleared only if they hold our tag.
    $accountChanges = [System.Collections.Generic.List[object]]::new()
    $accountSkips = [System.Collections.Generic.List[object]]::new()
    $getAccountChanges = {
        param([object]$Recipient, [string]$Tag)
        $changes = [ordered]@{}
        $wanted = [ordered]@{ CustomAttribute1 = $Tag }
        foreach ($role in $roles) {
            $current = $Recipient.Attributes[$role.MembershipAttribute]
            if ($role.Tag -ceq $Tag) { $wanted[$role.MembershipAttribute] = $Tag }
            elseif ($current -ceq $role.Tag) { $wanted[$role.MembershipAttribute] = '' }
        }
        foreach ($attribute in $wanted.Keys) {
            if ($Recipient.Attributes[$attribute] -cne $wanted[$attribute]) {
                $changes[$attribute] = @{ From = $Recipient.Attributes[$attribute]; To = $wanted[$attribute] }
            }
        }
        return , $changes
    }
    foreach ($accountEmail in ($Desired.Accounts.Keys | Sort-Object)) {
        $tag = $Desired.Accounts[$accountEmail]
        $recipient = $recipientsByEmail[$accountEmail]
        if ($null -eq $recipient) {
            $accountSkips.Add([pscustomobject]@{ Role = $tag; Email = $accountEmail; Reason = 'no user account found' })
            continue
        }
        if ($script:AccountRecipientTypes -notcontains $recipient.RecipientTypeDetails) {
            $accountSkips.Add([pscustomobject]@{ Role = $tag; Email = $accountEmail; Reason = "unsupported recipient type $($recipient.RecipientTypeDetails)" })
            continue
        }
        $changes = & $getAccountChanges $recipient $tag
        if ($changes.Count -gt 0) {
            $accountChanges.Add([pscustomobject]@{
                    Id = $recipient.Id; Email = $accountEmail; DisplayName = $recipient.Name
                    RecipientTypeDetails = $recipient.RecipientTypeDetails; Tag = $tag; Changes = $changes
                })
        }
    }
    $managedAccounts = @($State.Recipients | Where-Object {
            $accountTags -contains $_.Attributes.CustomAttribute1 -and $script:AccountRecipientTypes -contains $_.RecipientTypeDetails
        })
    $accountUntags = 0
    foreach ($r in $managedAccounts) {
        $stillWanted = @(@($r.Emails) + @($r.PrimaryEmail) | Where-Object { $_ -and $Desired.Accounts.ContainsKey($_) }).Count -gt 0
        if (-not $stillWanted) {
            $accountUntags++
            $accountChanges.Add([pscustomobject]@{
                    Id = $r.Id; Email = $r.PrimaryEmail; DisplayName = $r.Name
                    RecipientTypeDetails = $r.RecipientTypeDetails; Tag = ''; Changes = (& $getAccountChanges $r '')
                })
        }
    }

    $max = [double]$Config.MaxRemovalPercent
    $contactRemovalPercent = if ($managed.Count -gt 0) { 100.0 * $removals.Count / $managed.Count } else { 0 }
    $accountRemovalPercent = if ($managedAccounts.Count -gt 0) { 100.0 * $accountUntags / $managedAccounts.Count } else { 0 }

    return @{
        Adds                  = $adds.ToArray()
        Updates               = $updates.ToArray()
        Removals              = $removals.ToArray()
        Conflicts             = $conflicts.ToArray()
        AccountChanges        = $accountChanges.ToArray()
        AccountSkips          = $accountSkips.ToArray()
        ManagedContactCount   = $managed.Count
        ManagedAccountCount   = $managedAccounts.Count
        ContactRemovalPercent = $contactRemovalPercent
        AccountRemovalPercent = $accountRemovalPercent
        RemovalGuardTripped   = ($contactRemovalPercent -gt $max) -or ($accountRemovalPercent -gt $max)
    }
}

function ConvertTo-CmdletValue {
    [OutputType([object])]
    param([AllowNull()][object]$Value)

    # Exchange clears a string attribute when given $null, not ''.
    if ($Value -is [string] -and $Value -eq '') { return $null }
    return $Value
}

function Invoke-WithRetry {
    [OutputType([object])]
    param(
        [Parameter(Mandatory)][scriptblock]$Action,
        [int]$Attempts = 3,
        [int]$DelaySeconds = 5
    )

    for ($i = 1; ; $i++) {
        try { return & $Action }
        catch {
            if ($i -ge $Attempts) { throw }
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

function Invoke-SyncPlan {
    <#
      Applies a plan. Every item has its own try/catch so one failure doesn't
      stop the run. Returns success/failure counts per action.
    #>
    [OutputType([hashtable])]
    param([Parameter(Mandatory)][hashtable]$Plan)

    $result = @{ Added = 0; Updated = 0; Removed = 0; AccountsUpdated = 0; Failed = 0 }

    foreach ($item in $Plan.Adds) {
        try {
            $created = New-MailContact -Name $item.Name -DisplayName $item.DisplayName `
                -FirstName $item.FirstName -LastName $item.LastName `
                -ExternalEmailAddress $item.Email -ErrorAction Stop
            $params = @{ Identity = [string]$created.Guid; HiddenFromAddressListsEnabled = $true; ErrorAction = 'Stop' }
            foreach ($attribute in $item.Attributes.Keys) { $params[$attribute] = ConvertTo-CmdletValue $item.Attributes[$attribute] }
            # A new object can take a moment to become writable.
            Invoke-WithRetry { Set-MailContact @params } | Out-Null
            $result.Added++
            Write-SyncLog "ADDED   $(Protect-Email $item.Email) [$($item.PrimaryTag)]"
        }
        catch {
            $result.Failed++
            Write-SyncLog -Level ERROR "FAILED add $(Protect-Email $item.Email): $($_.Exception.Message)"
        }
    }

    foreach ($item in $Plan.Updates) {
        try {
            if ($item.ContactChanges.Count -gt 0) {
                $params = @{ Identity = $item.Id; ErrorAction = 'Stop' }
                foreach ($field in $item.ContactChanges.Keys) { $params[$field] = ConvertTo-CmdletValue $item.ContactChanges[$field].To }
                Set-Contact @params
            }
            if ($item.MailContactChanges.Count -gt 0) {
                $params = @{ Identity = $item.Id; ErrorAction = 'Stop' }
                foreach ($field in $item.MailContactChanges.Keys) { $params[$field] = ConvertTo-CmdletValue $item.MailContactChanges[$field].To }
                Set-MailContact @params
            }
            $result.Updated++
            Write-SyncLog "UPDATED $(Protect-Email $item.Email) [$($item.PrimaryTag)]"
        }
        catch {
            $result.Failed++
            Write-SyncLog -Level ERROR "FAILED update $(Protect-Email $item.Email): $($_.Exception.Message)"
        }
    }

    foreach ($item in $Plan.Removals) {
        try {
            Remove-MailContact -Identity $item.Id -Confirm:$false -ErrorAction Stop
            $result.Removed++
            Write-SyncLog "REMOVED $(Protect-Email $item.Email) [$($item.PrimaryTag)]"
        }
        catch {
            $result.Failed++
            Write-SyncLog -Level ERROR "FAILED remove $(Protect-Email $item.Email): $($_.Exception.Message)"
        }
    }

    foreach ($item in $Plan.AccountChanges) {
        try {
            $params = @{ Identity = $item.Id; ErrorAction = 'Stop' }
            foreach ($field in $item.Changes.Keys) { $params[$field] = ConvertTo-CmdletValue $item.Changes[$field].To }
            if ($item.RecipientTypeDetails -eq 'MailUser') { Set-MailUser @params } else { Set-Mailbox @params }
            $result.AccountsUpdated++
            Write-SyncLog "ACCOUNT $(Protect-Email $item.Email) [$($item.Tag)] $(@($item.Changes.Keys) -join ', ')"
        }
        catch {
            $result.Failed++
            Write-SyncLog -Level ERROR "FAILED account $(Protect-Email $item.Email): $($_.Exception.Message)"
        }
    }

    return $result
}
