# Microsoft 365 student accounts

Scripts that check every student in Year 3 and up has a Microsoft 365
account, linked to their record in the portal database and in the right
Teams. They run locally on a Mac, by hand, and **change nothing unless you
ask them to**.

These scripts are separate from the contact and distribution list sync in
[`../m365-sync`](../m365-sync/README.md). They share its logging helpers
(`../m365-sync/lib/Common.ps1`) and read its `config.psd1` to make sure the
two never clash, but they never change anything there.

## Prerequisites

### Software

| Software                                | Version                          | Needed for                                                                   | Install                                                                      |
| --------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| macOS (or Linux) with `bash`            | any recent                       | Running the scripts                                                          | built in                                                                     |
| [Homebrew](https://brew.sh)             | any                              | Installing the tools below on a Mac                                          | see [brew.sh](https://brew.sh)                                               |
| PowerShell (`pwsh`)                     | **7.2+**                         | All `.ps1` scripts                                                           | `brew install --cask powershell`                                             |
| `Microsoft.Graph.Authentication` module | 2.x                              | Signing in to and calling Microsoft 365 (Microsoft Graph)                    | `pwsh -c "Install-Module Microsoft.Graph.Authentication -Scope CurrentUser"` |
| Supabase CLI (`supabase`)               | 2.117+ (has `supabase db query`) | `fetch-students.sh` reads the portal database                                | `brew install supabase/tap/supabase` (or `npx supabase`)                     |
| `jq`                                    | 1.6+                             | `fetch-students.sh` checks and summarises the data                           | built into macOS; otherwise `brew install jq`                                |
| A copy of this repository               | —                                | The scripts use `../m365-sync/lib/Common.ps1` and `../m365-sync/config.psd1` | `git clone`                                                                  |
| Pester module                           | 5.0+                             | Running the tests only                                                       | `pwsh -c "Install-Module Pester -Scope CurrentUser -MinimumVersion 5.0"`     |
| Excel, Numbers or any CSV editor        | —                                | Reading reports and approving Team changes                                   | —                                                                            |

Only the `Microsoft.Graph.Authentication` module is needed, not the whole
Microsoft Graph SDK: the scripts call the Graph API directly with
`Invoke-MgGraphRequest`.

Check everything is installed:

```bash
pwsh --version                     # PowerShell 7.2 or later
pwsh -c "Get-Module -ListAvailable Microsoft.Graph.Authentication, Pester | Select Name, Version"
supabase --version
jq --version
```

### Access

| Access                                                                           | Needed for                                                                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| The portal's **production Supabase project**                                     | `fetch-students.sh`: run `supabase login`, then `supabase link` from the repository root |
| A Microsoft 365 account with **Global Reader**                                   | Inventory and dry runs (read-only)                                                       |
| A Microsoft 365 account with **User Administrator** and **Groups Administrator** | `-Apply`, `-ApplyTeamChanges`, `setup-teams.ps1 -Apply`                                  |
| Consent to the **Microsoft Graph PowerShell** app's permissions                  | Asked for at first sign-in; a Global Administrator may need to approve it                |

See [One-off setup](#one-off-setup) for the first-time steps.

## Contents

- [Prerequisites](#prerequisites)
- [Who needs an account](#who-needs-an-account)
- [How accounts are linked](#how-accounts-are-linked)
- [One-off setup](#one-off-setup)
- [Inventory: see the current Microsoft 365 setup](#inventory-see-the-current-microsoft-365-setup)
- [Fetching student data](#fetching-student-data)
- [Dry run: compare with Microsoft 365](#dry-run-compare-with-microsoft-365)
- [Reading the reports](#reading-the-reports)
- [Apply: create and update accounts](#apply-create-and-update-accounts)
- [Teams](#teams)
- [First run](#first-run)
- [Everyday use](#everyday-use)
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

| Microsoft 365 field  | Value                   | Where you can see it                                             |
| -------------------- | ----------------------- | ---------------------------------------------------------------- |
| **Employee ID**      | `students.student_code` | Entra admin centre → Users → user → Properties → Job information |
| **CustomAttribute1** | `Student`               | Exchange admin centre → mailbox → Custom attributes              |
| **CustomAttribute4** | `Student`               | as above                                                         |

- The Employee ID is the link. A student without a `student_code` can't be
  linked, so the scripts report them and ask you to add a code in the portal.
- `CustomAttribute1 = Student` marks the account as managed by these scripts,
  the same convention `../m365-sync` uses for `Teacher` and `Parent`.
  Exchange custom attributes 1-15 are the same fields that Microsoft Graph
  calls `onPremisesExtensionAttributes` 1-15.
- `CustomAttribute4 = Student` is the membership attribute. It makes an
  "All Students" dynamic list possible later.
- Nothing about the student's class or year group is stored on the account
  (Department is neither set nor checked, and any existing value is left
  alone). Class membership is recorded by the class Teams, and the reports
  show each student's year group.

> **Don't add `Student` to `Tags` in `../m365-sync/config.psd1`.** The
> contact sync would treat every student account as a teacher/parent
> account it no longer wants and clear its attributes. Every script here
> checks this at start-up, and also that no contact sync tag uses
> `CustomAttribute4`, and stops with an error if either is true.

## One-off setup

### 1. Install the prerequisites

Install everything in [Prerequisites](#prerequisites), then connect the
Supabase CLI to the production project, from the repository root:

```bash
supabase login
supabase link   # choose the production project, if not already linked
```

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
| `inventory-teams-<stamp>.csv`    | Microsoft 365 group / Team | id, name, mail nickname, is a Team, named like a class/year Team, owner and member counts, owners' usernames, description                                 |
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
| `~ UPDATE`      | Linked account whose name or tags differ from the portal                                            |
| `$ LICENCE`     | Account without the configured licence                                                              |
| `> TEAM ADD`    | Student missing from their class Team or the year group (needs review, see below)                   |
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
Existing usernames written as `firstlast` (no dot) or `first-last` count as
matching the name, so they aren't reported.

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

| `sync-students.ps1`        | Effect                                                   |
| -------------------------- | -------------------------------------------------------- |
| _(none)_                   | Dry run                                                  |
| `-Apply`                   | Make the account changes (never Teams)                   |
| `-ApplyTeamChanges <file>` | Apply the approved rows of a reviewed Team change file   |
| `-Force`                   | Allow Team removals above `MaxTeamRemovalPercent`        |
| `-KeepData`                | Keep `data/students.json` after `-ApplyTeamChanges`      |
| `-Only <code>`             | Plan for one student only (useful for a first test)      |
| `-Device`                  | Sign in with a device code                               |
| `-ShowEmails`              | Show full usernames on screen (never written to the log) |
| `-DataPath <file>`         | Use a different data file                                |

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
changes in Teams until you approve rows; see [Teams](#teams).

| Column                       | Contents                                                      |
| ---------------------------- | ------------------------------------------------------------- |
| `ChangeId`                   | Identifies the change (don't edit)                            |
| `Action`                     | `ADD` or `REMOVE`                                             |
| `Team`, `TeamNickname`       | The Team                                                      |
| `StudentCode`, `StudentName` | The student                                                   |
| `Reason`                     | Why (e.g. "no longer in this class in the portal")            |
| `GeneratedAt`                | When the file was written                                     |
| `Approved`                   | Type `yes` to approve; leave empty (or anything else) to skip |

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
  surname, display name, Employee ID, `CustomAttribute1` and
  `CustomAttribute4`, usage location and the configured licence. Sign-in is
  enabled with a random 14-character initial password that must be changed
  at first sign-in.
- `LINK` and `UPDATE`: only first name, surname, display name, Employee ID,
  usage location and custom attributes can be set. Any other field
  (username, email addresses, aliases, sign-in status, Department) is
  refused in code.
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

## Teams

Each student belongs in:

- the **year group** for the current academic year, e.g.
  `HSHB Student 2026-2027`: a plain Microsoft 365 group like last year's
  (set `YearTeamIsTeam = $true` to make it a Team as well)
- a **class Team** for each of their current classes in an eligible year
  group, e.g. `Year 3 - 2026-2027`

Teams are found by their **mail nickname**, built from the class name and
the year, so they match the Teams made by hand for 2026-27 and those are
adopted, not duplicated:

| Team  | Mail nickname (`config.psd1`)                                  | Display name (`config.psd1`)                             |
| ----- | -------------------------------------------------------------- | -------------------------------------------------------- |
| Year  | `YearTeamNicknameFormat` `students-{2}` → `students-2026-2027` | `YearTeamNameFormat` `HSHB Student {2}`                  |
| Class | `ClassTeamNicknameFormat` `{0}-{2}` → `year3-2026-2027`        | `ClassTeamNameFormat` `{0} - {2}` → `Year 3 - 2026-2027` |

In the formats, `{0}` is the class's Team name, `{1}` the year code
(`2026-27`) and `{2}` the long year (`2026-2027`). In a nickname, `{0}` is
the Team name in lowercase letters and digits only (`A Level` → `alevel`).

A class's Team name is its portal class name, unless it is mapped in
`ClassTeamNames`. The GCSE classes are mapped because the Teams use digits
and the portal uses Roman numerals:

```powershell
ClassTeamNames = @{ 'GCSE I' = 'GCSE1'; 'GCSE II' = 'GCSE2'; 'GCSE III' = 'GCSE3' }
```

If a class is renamed in the portal, its nickname changes too, so the
scripts look for (and would create) a Team under the new name. Add the new
name to `ClassTeamNames`, mapped to the old Team name, to keep using the
existing Team.

Each year's nicknames include the year, so a new academic year gets new
Teams, and last year's are left alone.

### Create this year's Teams

```bash
./fetch-students.sh
pwsh ./setup-teams.ps1          # dry run
pwsh ./setup-teams.ps1 -Apply
```

For the year group and each eligible class it:

- **creates** it if it doesn't exist: a private Microsoft 365 group
  (welcome emails off), turned into a Team for classes (and for the year
  group only if `YearTeamIsTeam`). Owners:
  - class Teams: the class teacher (`classes.teacher_id` → their school
    email)
  - the year group: **you**, the account signed in when it is created
  - both: anyone in `DefaultTeamOwners` (usually empty)

  A group must have an owner: if none can be found, it is reported
  (`NO OWNER`) and skipped. Running the script again later doesn't add the
  person running it to an existing year group.

- turns an existing class group with the right nickname into a Team
- updates the display name if the class was renamed
- adds missing owners

It **never** deletes a Team, removes an owner or changes student
membership. Teams named for another year (e.g. `Year 3 - 2025-2026`,
`year3-2025-2026`) are listed as `PAST TEAM` so you can archive them in
Teams when you're ready.

Last year's year group, `HSHB Student 2025-2026` (`students2025`), doesn't
follow the naming, so it is never changed. Its id is in
`LegacyStudentTeamIds`, which is used only to help match existing accounts
by name.

New Teams can take a few minutes to appear in the Teams app.

### Review and apply membership changes

Membership changes are never made without a person approving them:

1. Run a dry run (or `-Apply`); it writes `reports/team-changes-<stamp>.csv`.
2. Open it (e.g. in Excel), check each row and type `yes` in `Approved` for
   the ones to make. Save it as CSV.
3. Apply the approved rows:

   ```bash
   pwsh ./sync-students.ps1 -ApplyTeamChanges reports/team-changes-<stamp>.csv
   ```

This run:

- signs in with write access, reads Microsoft 365 again and works out the
  changes afresh
- applies a row only if it is approved **and** still needed now, using the
  current ids from Microsoft 365 (never ids from the file). Rows that are
  already done, no longer needed, or whose `Action`, `TeamNickname` or
  `StudentCode` was edited are skipped and listed
- skips rows for students whose account doesn't exist yet (run `-Apply`
  first)
- refuses a file older than `MaxDataAgeHours`, and stops if approved
  removals exceed `MaxTeamRemovalPercent` unless you pass `-Force`
- makes no account changes
- deletes `data/students.json` when it finishes without errors (unless
  `-KeepData`)

**What can be removed:** only members tagged `CustomAttribute1 = Student`,
only from this year's managed Teams, and only when the portal says the
student is no longer in that class. Teachers, owners and anyone else are
never removed. Leavers are reported, not removed.

## First run

Run everything from `scripts/m365-students`.

1. **Inventory** the tenant and set `LicenseSkuPartNumber` and
   `LegacyStudentTeamIds` in `config.psd1`:

   ```bash
   pwsh ./inventory-m365.ps1
   ```

2. **Fetch** the student data. Fix any students with no code or no class in
   the portal, then fetch again:

   ```bash
   ./fetch-students.sh
   ```

3. **Create this year's Teams** (dry run, then apply):

   ```bash
   pwsh ./setup-teams.ps1
   pwsh ./setup-teams.ps1 -Apply
   ```

4. **Dry run** the account sync and read `reports/students-*.csv`:

   ```bash
   pwsh ./sync-students.ps1
   ```

   Expect `LINK` for students who already have an account with their name,
   and `CREATE` for the rest. Resolve every `AMBIGUOUS` by setting the
   right account's Employee ID by hand, then run the dry run again.

5. **Try one student**, then check the account in the Entra admin centre:

   ```bash
   pwsh ./sync-students.ps1 -Only S001 -Apply
   ```

6. **Apply** the account changes, then hand out the passwords from
   `reports/new-accounts-*.csv` and delete that file:

   ```bash
   pwsh ./sync-students.ps1 -Apply
   ```

7. **Review Team changes** in the newest `reports/team-changes-*.csv` and
   apply the approved rows:

   ```bash
   pwsh ./sync-students.ps1 -ApplyTeamChanges reports/team-changes-<stamp>.csv
   ```

8. **Check idempotency**: fetch and dry run again. It should plan no
   account or Team changes, leaving only report-only items.

## Everyday use

Whenever students have changed in the portal (new students, class changes,
leavers), and at the start of each academic year:

```bash
cd scripts/m365-students
./fetch-students.sh
pwsh ./setup-teams.ps1                  # new year or new classes: then -Apply
pwsh ./sync-students.ps1                # review the screen and reports
pwsh ./sync-students.ps1 -Apply         # accounts
# review reports/team-changes-<stamp>.csv, mark Approved = yes
pwsh ./sync-students.ps1 -ApplyTeamChanges reports/team-changes-<stamp>.csv
```

Then deal with the report-only items by hand: leavers (disable or delete
when appropriate), ambiguous matches, missing codes.

### New academic year

1. Roll the year over in the portal (new classes, `is_current`).
2. Fetch, then `setup-teams.ps1 -Apply` to create the new year's Teams.
3. Dry run, `-Apply`, review and `-ApplyTeamChanges` as usual. Students are
   added to the new Teams; last year's Teams are listed as `PAST TEAM` and
   never changed.

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
| `setup-teams.ps1`       | Creates or fixes this year's Teams                                          |
| `lib/TeamSetup.ps1`     | Works out and makes the Team setup changes                                  |
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

`inventory-m365.ps1` and `setup-teams.ps1` exit codes: `0` success, `1`
fatal error, `3` (setup) some changes failed.

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

### Moving to an unattended job later

- Swap the interactive sign-in in `Connect-SyncGraph` (`lib/Graph.ps1`) for
  app-only authentication (`Connect-MgGraph -ClientId … -CertificateThumbprint … -TenantId …`)
  with an app registration granted the same Graph permissions.
- Replace `fetch-students.sh` with anything that writes the same JSON.
- Keep the dry run and the exit codes. A job can run the dry run on a
  schedule and alert on exit codes `2` and `3`, or when the reports show
  changes. Keep `-Apply` and Team approval as deliberate, human steps unless
  you decide otherwise.
