# Microsoft 365 student accounts

Scripts that check every student in Year 3 and up has a Microsoft 365
account, linked to their record in the portal database and in the right
Teams. They run locally on a Mac, by hand, and **change nothing unless you
ask them to**.

These scripts are separate from the contact and distribution list sync in
[`../m365-sync`](../m365-sync/README.md). They share its logging helpers
(`../m365-sync/lib/Common.ps1`) and read its `config.psd1` to make sure the
two never clash, but they never change anything there.

## Contents

- [How accounts are linked](#how-accounts-are-linked)
- [One-off setup](#one-off-setup)
- [Inventory: see the current Microsoft 365 setup](#inventory-see-the-current-microsoft-365-setup)
- [Data protection](#data-protection)
- [Reference](#reference)

## How accounts are linked

Each student account carries the student's details from the portal, so the
scripts can match accounts to students exactly, never by guessing from
names:

| Microsoft 365 field  | Value                    | Where you can see it                                             |
| -------------------- | ------------------------ | ---------------------------------------------------------------- |
| **Employee ID**      | `students.student_code`  | Entra admin centre → Users → user → Properties → Job information |
| **CustomAttribute1** | `Student`                | Exchange admin centre → mailbox → Custom attributes              |
| **CustomAttribute4** | `Student`                | as above                                                         |
| **Department**       | the student's year group | Microsoft 365 admin centre and Entra, user details               |

- The Employee ID is the link. A student without a `student_code` can't be
  linked, so the scripts report them and ask you to add a code in the portal.
- `CustomAttribute1 = Student` marks the account as managed by these scripts,
  the same convention `../m365-sync` uses for `Teacher` and `Parent`.
  Exchange custom attributes 1-15 are the same fields that Microsoft Graph
  calls `onPremisesExtensionAttributes` 1-15.
- `CustomAttribute4 = Student` is the membership attribute. It makes an
  "All Students" dynamic list possible later.

> **Don't add `Student` to `Tags` in `../m365-sync/config.psd1`.** The
> contact sync would treat every student account as a teacher/parent
> account it no longer wants and clear its attributes. Every script here
> checks this at start-up, and also that no contact sync tag uses
> `CustomAttribute4`, and stops with an error if either is true.

## One-off setup

### 1. Install tools

```bash
brew install --cask powershell   # PowerShell 7 (pwsh)
```

Install the Microsoft Graph sign-in module (and Pester, only needed to run
the tests):

```bash
pwsh -c "Install-Module Microsoft.Graph.Authentication -Scope CurrentUser"
pwsh -c "Install-Module Pester -Scope CurrentUser -MinimumVersion 5.0"
```

Only `Microsoft.Graph.Authentication` is needed: the scripts call the Graph
API directly with `Invoke-MgGraphRequest`.

### 2. Check the config

`config.psd1` is committed and holds no personal data. Each setting is
explained in the file. The ones to check first are `Domain` and
`LicenseSkuPartNumber`; the [inventory](#inventory-see-the-current-microsoft-365-setup)
shows the licence names available in your tenant.

Optionally, to be reminded which account to sign in with:

```bash
cd scripts/m365-students
cp .env.example .env   # then set M365_ADMIN_UPN (gitignored)
```

### 3. Check your Microsoft 365 role

| Task                                  | Roles needed                                        |
| ------------------------------------- | --------------------------------------------------- |
| Inventory, dry runs (read-only)       | **Global Reader**                                   |
| Creating and updating accounts, Teams | **User Administrator** and **Groups Administrator** |

The first sign-in asks you (or a Global Administrator) to consent to the
Microsoft Graph PowerShell app's permissions. Read-only runs ask only for
`User.Read.All`, `GroupMember.Read.All` and `Directory.Read.All`, so they
**cannot** change anything, even by mistake.

## Inventory: see the current Microsoft 365 setup

Run this first, and whenever you want a snapshot of the tenant. It needs no
database access and changes nothing.

```bash
cd scripts/m365-students
pwsh ./inventory-m365.ps1          # add -Device to sign in with a code
```

It prints counts only (users, how many have an Employee ID, how many look
like `firstname.lastname`, values of CustomAttribute1, Teams, licences
used/available) and saves three CSV files in `reports/`:

| File                             | One row per                | Columns                                                                                                                                                   |
| -------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory-users-<stamp>.csv`    | user                       | username, given name, surname, display name, enabled, Employee ID, Employee type, Department, synced from AD, licences, groups/Teams, CustomAttribute1-15 |
| `inventory-teams-<stamp>.csv`    | Microsoft 365 group / Team | id, name, mail nickname, is a Team, managed by these scripts, owner and member counts, description                                                        |
| `inventory-licences-<stamp>.csv` | licence (SKU)              | part number, id, total, used, available                                                                                                                   |

Use it to decide:

- which licence to give students (`LicenseSkuPartNumber`), and whether
  there are enough available
- the id of last year's student Team (`LegacyStudentTeamIds`)
- whether existing student accounts follow the `firstname.lastname`
  convention and already have an Employee ID

## Data protection

- The CSV reports contain personal data. They are saved in `reports/`,
  which is gitignored, and both the folder and the files are readable only
  by you. Don't email or share them; delete them when you're done.
- The screen and log files (`logs/`, gitignored, kept for
  `LogRetentionDays`) show counts only.

## Reference

### Files

| File                    | Purpose                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `inventory-m365.ps1`    | Read-only export of users, Teams and licences                               |
| `config.psd1`           | Settings (committed, no personal data)                                      |
| `lib/StudentConfig.ps1` | Loads and checks the config; the contact sync clash check; year group rules |
| `lib/Graph.ps1`         | Microsoft Graph sign-in and reading the tenant                              |
| `lib/Inventory.ps1`     | Builds the inventory rows and summary                                       |
| `lib/Reports.ps1`       | Owner-only CSV files                                                        |
| `tests/`                | Pester tests (no Microsoft 365 connection needed)                           |

Run the tests with:

```bash
pwsh -c "Invoke-Pester ./tests"
```

Exit codes: `0` success, `1` fatal error.
