#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
# Run: pwsh -c "Invoke-Pester ./tests"

BeforeAll {
    . (Join-Path $PSScriptRoot 'TestHelpers.ps1')
    . (Join-Path $script:Root '../shared/Common.ps1')
    . (Join-Path $script:Root 'lib/StudentConfig.ps1')
    . (Join-Path $script:Root 'lib/StudentData.ps1')
    . (Join-Path $script:Root 'lib/Graph.ps1')
    . (Join-Path $script:Root 'lib/StudentPlan.ps1')
    . (Join-Path $script:Root 'lib/Apply.ps1')
    Mock Write-Host { }
}

Describe 'New-InitialPassword' {
    It 'has 14 characters with upper, lower and digits, and no look-alikes' {
        foreach ($i in 1..50) {
            $p = New-InitialPassword
            $p.Length | Should -Be 14
            $p | Should -MatchExactly '[A-Z]'
            $p | Should -MatchExactly '[a-z]'
            $p | Should -Match '[0-9]'
            $p | Should -Not -MatchExactly '[0O1lI]'
        }
    }

    It 'is different each time' {
        @(1..20 | ForEach-Object { New-InitialPassword } | Select-Object -Unique).Count | Should -Be 20
    }
}

Describe 'ConvertTo-GraphUserPatch' {
    It 'maps custom attributes to onPremisesExtensionAttributes and clears with null' {
        $body = ConvertTo-GraphUserPatch -Changes ([ordered]@{
                givenName        = @{ From = 'Alise'; To = 'Alice' }
                surname          = @{ From = 'Smith'; To = '' }
                CustomAttribute1 = @{ From = ''; To = 'Student' }
                CustomAttribute4 = @{ From = ''; To = 'Student' }
            })
        $body.givenName | Should -Be 'Alice'
        $body.ContainsKey('surname') | Should -BeTrue
        $body.surname | Should -BeNullOrEmpty
        $body.onPremisesExtensionAttributes.extensionAttribute1 | Should -Be 'Student'
        $body.onPremisesExtensionAttributes.extensionAttribute4 | Should -Be 'Student'
    }

    It 'refuses to change <Field>' -ForEach @(
        @{ Field = 'userPrincipalName' }, @{ Field = 'mail' }, @{ Field = 'mailNickname' },
        @{ Field = 'proxyAddresses' }, @{ Field = 'otherMails' }, @{ Field = 'accountEnabled' }, @{ Field = 'department' }
    ) {
        { ConvertTo-GraphUserPatch -Changes @{ $Field = @{ From = 'a'; To = 'b' } } } | Should -Throw "*Refusing to change '$Field'*"
    }
}

Describe 'Invoke-AccountPlan' {
    BeforeEach {
        $script:bob = New-GraphUser -Upn 'bjones@school.example' -Given 'Bob' -Surname 'Jones' -UsageLocation '' -SkuIds @('sku-student')
        $script:cara = New-StudentAccount 'cara.lee@school.example' 'Kara' 'Lee' 'S003'
        $cara.assignedLicenses = @()
        $script:tenant = New-FakeTenant -Users @($bob, $cara) -Groups (New-CurrentTeams)
        Mock Invoke-MgGraphRequest { Invoke-FakeGraph -Tenant $script:tenant -Method $Method -Uri $Uri -Body $Body }
        $desired = Get-TestDesired -Students @(
            (New-TestStudent 'S001' 'Zoë' "O'Brien" @('Y3')),
            (New-TestStudent 'S002' 'Bob' 'Jones' @('Y4')),
            (New-TestStudent 'S003' 'Cara' 'Lee' @('Y3')))
        $script:desired = $desired
        $script:plan = New-StudentPlan -Desired $desired -State (Get-GraphTenantState) -Config (New-TestConfig)
        $script:tenant.Calls.Clear()
    }

    It 'creates, links, updates and licenses, then a new plan has no account changes' {
        $result = Invoke-AccountPlan -Plan $plan -RetryDelaySeconds 0
        $result.Created | Should -Be 1
        $result.Linked | Should -Be 1
        $result.Updated | Should -Be 1
        $result.Licensed | Should -Be 2
        $result.Failed | Should -Be 0

        $again = New-StudentPlan -Desired $desired -State (Get-GraphTenantState) -Config (New-TestConfig)
        $again.Creates + $again.Links + $again.Updates + $again.Licenses | Should -BeNullOrEmpty
    }

    It 'creates the account with the link fields and a forced password change' {
        $result = Invoke-AccountPlan -Plan $plan -RetryDelaySeconds 0
        $post = @($tenant.Calls | Where-Object { $_.Method -eq 'POST' -and $_.Uri -eq 'v1.0/users' })[0].Body
        $post.userPrincipalName | Should -Be 'zoe.obrien@school.example'
        $post.mailNickname | Should -Be 'zoe.obrien'
        $post.employeeId | Should -Be 'S001'
        $post.officeLocation | Should -Be 'S001'
        $post.Keys | Should -Not -Contain 'department'
        $post.usageLocation | Should -Be 'GB'
        $post.accountEnabled | Should -BeTrue
        $post.onPremisesExtensionAttributes.extensionAttribute1 | Should -Be 'Student'
        $post.onPremisesExtensionAttributes.extensionAttribute4 | Should -Be 'Student'
        $post.passwordProfile.forceChangePasswordNextSignIn | Should -BeTrue
        $result.NewAccounts[0].InitialPassword | Should -Be $post.passwordProfile.password
        $result.NewAccounts[0].Upn | Should -Be 'zoe.obrien@school.example'
    }

    It 'never sends a username or address outside a create, and never touches Teams' {
        Invoke-AccountPlan -Plan $plan -RetryDelaySeconds 0 | Out-Null
        foreach ($call in @($tenant.Calls | Where-Object Method -eq 'PATCH')) {
            $call.Body.Keys | Should -Not -Contain 'userPrincipalName'
            $call.Body.Keys | Should -Not -Contain 'mail'
            $call.Body.Keys | Should -Not -Contain 'mailNickname'
            $call.Body.Keys | Should -Not -Contain 'proxyAddresses'
        }
        @($tenant.Calls | Where-Object { $_.Uri -match 'groups' }) | Should -BeNullOrEmpty
    }

    It 'gives every new account the shared initial password when one is set' {
        $result = Invoke-AccountPlan -Plan $plan -InitialPassword 'Example-Start-99' -RetryDelaySeconds 0
        $post = @($tenant.Calls | Where-Object { $_.Method -eq 'POST' -and $_.Uri -eq 'v1.0/users' })[0].Body
        $post.passwordProfile.password | Should -Be 'Example-Start-99'
        $post.passwordProfile.forceChangePasswordNextSignIn | Should -BeTrue
        $result.NewAccounts[0].InitialPassword | Should -Be 'Example-Start-99'
    }

    It 'refuses an initial password shorter than 8 characters' {
        { Invoke-AccountPlan -Plan $plan -InitialPassword 'short' -RetryDelaySeconds 0 } | Should -Throw '*8 to 256*'
        Get-WriteCalls -Tenant $tenant | Should -BeNullOrEmpty
    }

    It 'keeps the password when the licence fails, and carries on after a failure' {
        Mock Invoke-MgGraphRequest {
            if ($Uri -match 'assignLicense') { throw 'licence unavailable' }
            if ($Method -eq 'PATCH' -and $Uri -match [regex]::Escape($script:bob.id)) { throw 'patch failed' }
            Invoke-FakeGraph -Tenant $script:tenant -Method $Method -Uri $Uri -Body $Body
        }
        $result = Invoke-AccountPlan -Plan $plan -RetryDelaySeconds 0
        $result.Created | Should -Be 1
        $result.NewAccounts.Count | Should -Be 1
        $result.Updated | Should -Be 1
        $result.Failed | Should -Be 3   # 2 licences + 1 link
    }
}
