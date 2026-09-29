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
- [Dry run: compare with Microsoft 365](#dry-run-compare-with-microsoft-365)
- [Reading the reports](#reading-the-reports)
- [Apply: create and update accounts](#apply-create-and-update-accounts)
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

## Dry run: compare with Microsoft 365

```bash
cd scripts/m365-students
./fetch-students.sh
pwsh ./sync-students.ps1          # dry run: changes nothing
```

The dry run signs in with **read-only** permissions, so it cannot change
anything. It shows on screen, for every student in Year 3 and up:

| Line            | Meaning                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `+ CREATE`      | No account found: a new `firstname.lastname@<Domain>` account is needed                             |
| `= LINK`        | One existing, unlinked account has the student's name: it will be linked (Employee ID and tags set) |
| `~ UPDATE`      | Linked account whose name, department or tags differ from the portal                                |
| `$ LICENCE`     | Account without the configured licence                                                              |
| `> TEAM ADD`    | Student missing from their class Team or the year Team (needs review, see below)                    |
| `< TEAM REMOVE` | Student in a class Team for a class they have left (needs review)                                   |
| `! …`           | Something to look at; report only (see [issues](#issues))                                           |

followed by a summary of counts, and it saves two reports (see
[Reading the reports](#reading-the-reports)).

Names are shown on screen only; usernames are masked (`a***@hshb.org.uk`)
unless you pass `-ShowEmails`, which prints a warning first. The log file
holds student codes and masked usernames, never names.

**Usernames and email addresses are never changed.** They are set once,
when an account is created. If a student's name changes in the portal,
their display name, first name and surname are updated, and a
`NAME/UPN MISMATCH` is reported for you to decide on; the username stays.

### New usernames

`firstname.lastname`, in lowercase, with accents removed (`Zoë` → `zoe`),
apostrophes dropped (`O'Brien` → `obrien`) and spaces or other characters
turned into hyphens (`Mary Jane` → `mary-jane`). If the username is already
used by any user, group or email alias, a number is added:
`alice.smith2`, `alice.smith3`, …

### Matching existing accounts

1. An account whose **Employee ID** is the student's code is theirs.
2. Otherwise, an account with no Employee ID and no `CustomAttribute1` whose
   first name and surname (or display name) match the student's, ignoring
   case and accents, is **linked**, if it is the only one. If several
   match, the one in last year's Team (`LegacyStudentTeamIds`) is preferred;
   if that doesn't settle it, the student is reported as `AMBIGUOUS` and
   nothing is done. Set the right account's Employee ID by hand (Entra admin
   centre → user → Properties → Job information) and run again.
3. Otherwise a new account is created.

Accounts tagged for anything else (e.g. `CustomAttribute1 = Teacher`) are
never linked to a student.

### Options

| `sync-students.ps1` | Effect                                                   |
| ------------------- | -------------------------------------------------------- |
| _(none)_            | Dry run                                                  |
| `-Apply`            | Make the account changes (never Teams)                   |
| `-Force`            | Allow Team removals above `MaxTeamRemovalPercent`        |
| `-Only <code>`      | Plan for one student only (useful for a first test)      |
| `-Device`           | Sign in with a device code                               |
| `-ShowEmails`       | Show full usernames on screen (never written to the log) |
| `-DataPath <file>`  | Use a different data file                                |

Exit codes: `0` success, `1` fatal error or refused (nothing changed), `2`
Team removals exceed `MaxTeamRemovalPercent` (check the data), `3` some
changes failed, or some students need fixing (`NO CODE`,
`UNKNOWN YEAR GROUP`).

## Reading the reports

Both are saved in `reports/`, owner-only.

### `students-<stamp>.csv`: one row per student

This is the reconciliation view: for every Year 3+ student, their portal
details next to their Microsoft 365 account and Teams. Managed accounts that
no longer match a student (leavers, orphans) get a row too.

| Column                                                 | Contents                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `Status`                                               | `OK`, `CREATE`, `LINK`, `UPDATE`, or an issue type              |
| `StudentCode`                                          | Student code (= Employee ID)                                    |
| `DbFirstName`, `DbLastName`                            | Name in the portal                                              |
| `YearGroups`                                           | Year group(s) from their current classes                        |
| `Upn`                                                  | Username (for `CREATE`: the one that would be created)          |
| `AccountFirstName`, `AccountSurname`, `AccountEnabled` | The Microsoft 365 account as it is now                          |
| `ExpectedTeams`                                        | The year Team and their class Teams                             |
| `ActualTeams`                                          | Every Microsoft 365 group/Team the account is in now            |
| `Issues`                                               | Anything else: licence missing, sign-in blocked, Team to add, … |

### `team-changes-<stamp>.csv`: Team changes to review

One row per proposed Team change, with an empty `Approved` column. Nothing
changes in Teams from a dry run.

### Issues

Report only. Nothing is changed for these.

| Issue                                   | Meaning and what to do                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `NO CODE`                               | Year 3+ student with no student code. Add one in the portal.                                                             |
| `UNKNOWN YEAR GROUP`                    | A class year group isn't in either list in `config.psd1`. Add it to one.                                                 |
| `NO CLASS`                              | Active student with no current class. Check their enrolment.                                                             |
| `AMBIGUOUS`                             | Several unlinked accounts have the student's name, or one account matches several students. Set the Employee ID by hand. |
| `CONFLICT`                              | The account with this Employee ID is tagged for something else (e.g. `Teacher`). Check it.                               |
| `DUPLICATE EMPLOYEE ID`                 | Several accounts have the same Employee ID. Clear it on the wrong one.                                                   |
| `SYNCED ACCOUNT`                        | The account comes from on-premises Active Directory, so it must be changed there.                                        |
| `INVALID NAME`                          | The name has no letters usable in a username. Create the account by hand and set its Employee ID.                        |
| `NAME/UPN MISMATCH`                     | The username doesn't follow the name (e.g. after a name change). Usernames are never changed automatically.              |
| `DISABLED`                              | An active student's account has sign-in blocked.                                                                         |
| `LEAVER`                                | Managed account of a student who is no longer active. Disable or delete it by hand when appropriate.                     |
| `NOT ELIGIBLE`                          | Managed account of a student below Year 3.                                                                               |
| `ORPHAN`                                | Account tagged `Student` whose Employee ID matches no active student (or is empty).                                      |
| `MISSING TEAM`                          | This year's class or year Team doesn't exist yet.                                                                        |
| `LICENCE NOT SET` / `LICENCE NOT FOUND` | `LicenseSkuPartNumber` is empty, or not a licence in this tenant.                                                        |
| `LEGACY TEAM NOT FOUND`                 | An id in `LegacyStudentTeamIds` isn't a Microsoft 365 group.                                                             |

## Apply: create and update accounts

After reviewing the dry run:

```bash
pwsh ./sync-students.ps1 -Apply
```

This signs in with write access and makes the **account** changes only:

- `CREATE`: new account with `firstname.lastname@<Domain>`, first name,
  surname, display name, Employee ID, Department, `CustomAttribute1` and
  `CustomAttribute4`, usage location and the configured licence. Sign-in is
  enabled with a random 14-character initial password that must be changed
  at first sign-in.
- `LINK` and `UPDATE`: only first name, surname, display name, Employee ID,
  Department, usage location and custom attributes can be set. Any other
  field (username, email addresses, aliases, sign-in status) is refused in
  code.
- `LICENCE`: assigns the configured licence.

It **never** changes Team membership, usernames or email addresses, and
never disables or deletes an account.

It refuses to run if a year group is unknown (see
[Who needs an account](#who-needs-an-account)), and stops if Team removals
exceed `MaxTeamRemovalPercent` unless you pass `-Force`. Each change is
tried on its own, so one failure doesn't stop the rest; re-running is safe
and only retries what is still out of sync.

**Initial passwords** for new accounts are saved to
`reports/new-accounts-<stamp>.csv` (student code, name, username, initial
password), readable only by you, and are never shown on screen or logged.
Hand them out securely, then delete the file.

To try it on one student first:

```bash
pwsh ./sync-students.ps1 -Only S001          # dry run for one student
pwsh ./sync-students.ps1 -Only S001 -Apply
```

Then check the account in the Entra admin centre, and run a dry run again:
it should plan no account changes for that student.

## Data protection

- Only student ids, codes, names and classes leave the database, plus class
  teachers' school email addresses. `students.sql` selects nothing else.
- `data/students.json` holds personal data. It is gitignored and readable
  only by you. Don't copy it anywhere else.
- `reports/new-accounts-*.csv` holds initial passwords. Delete it once
  they have been handed out.
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
| `sync-students.ps1`     | Compares students with Microsoft 365 and reports (dry run)                  |
| `lib/StudentPlan.ps1`   | Works out the changes (pure, fully tested)                                  |
| `lib/TeamChanges.ps1`   | The Team change review file                                                 |
| `lib/Apply.ps1`         | Makes the account changes                                                   |
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

`inventory-m365.ps1` exit codes: `0` success, `1` fatal error.

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
