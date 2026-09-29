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

- [Who needs an account](#who-needs-an-account)
- [How accounts are linked](#how-accounts-are-linked)
- [One-off setup](#one-off-setup)
- [Inventory: see the current Microsoft 365 setup](#inventory-see-the-current-microsoft-365-setup)
- [Fetching student data](#fetching-student-data)
- [Data protection](#data-protection)
- [Reference](#reference)

## Who needs an account

Only students in **Year 3 and above** need an account. Which year groups
count is set in `config.psd1`, matched against `classes.year_group` (free
text in the portal), ignoring case and surrounding spaces:

```powershell
EligibleYearGroups = @('3', '4', '5', '6', 'GCSE', 'A Level')   # need an account and class Teams
IgnoredYearGroups  = @('pre-school', '1', '2', 'All', 'Test')    # no account, no Team
```

- A student needs an account if **any** of their current classes (in the
  current academic year) is in an eligible year group. A student in Dance
  (`All`) and Year 4 needs one; a student only in Dance doesn't.
- Only classes in eligible year groups get a class Team.
- A year group in **neither** list is reported as an unknown year group,
  and the scripts refuse to make changes until you add it to one list. This
  stops a new class from silently leaving students out, or giving accounts
  to young children.
- Students with no current class, and students in Year 3+ with no student
  code, are reported so you can fix them in the portal.
- When a student moves up from Year 2 to Year 3 in the portal, the next run
  picks them up.

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

## Fetching student data

The scripts compare Microsoft 365 with a snapshot of the portal database.
Take the snapshot with:

```bash
cd scripts/m365-students
./fetch-students.sh
```

This needs the Supabase CLI, logged in and linked to the production project
(`supabase login`, `supabase link` from the repository root), and `jq`.

It runs `students.sql` (read-only) and saves `data/students.json`. It takes:

- the current academic year (there must be exactly one)
- active classes in that year, with year group and class teacher's school
  email (used as the Team owner)
- active students with id, student code, first and last name, and their
  current classes (enrolments where `start_date <= today < end_date`, or no
  end date, the same rule as the portal)
- the codes of inactive students (to recognise leavers' accounts)

The screen shows counts only: students, how many have no code or no class,
students per year group. It stops without saving if there isn't exactly one
current academic year or there are no active students. The data file is
refused by the other scripts once it is more than `MaxDataAgeHours` (24)
old, so fetch again before each session.

## Data protection

- Only student ids, codes, names and classes leave the database, plus class
  teachers' school email addresses. `students.sql` selects nothing else.
- `data/students.json` holds personal data. It is gitignored and readable
  only by you. Don't copy it anywhere else.
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
| `students.sql`          | Selects the current year's classes and active students                      |
| `fetch-students.sh`     | Runs the SQL and writes `data/students.json`                                |
| `lib/StudentData.ps1`   | Reads and checks the data file; who needs an account and which Teams        |
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

### Data file format

`data/students.json` is the only link between the database and the
Microsoft 365 side. To run from a scheduled job later, produce the same JSON
another way.

```json
{
  "version": 1,
  "generatedAt": "2026-09-29T10:00:00+01:00",
  "currentYearCount": 1,
  "academicYear": { "id": "…", "code": "2026-27" },
  "classes": [
    {
      "id": "…",
      "name": "Year 3",
      "yearGroup": "3",
      "teacherEmail": "teacher@school.example"
    }
  ],
  "students": [
    {
      "id": "…",
      "code": "S001",
      "firstName": "Jane",
      "lastName": "Doe",
      "classIds": ["…"]
    }
  ],
  "inactiveCodes": ["S000"],
  "skipped": [{ "reason": "missing first or last name", "count": 1 }]
}
```
