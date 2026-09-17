# Microsoft 365 contact sync

Keeps Exchange Online **mail contacts** in line with the portal database, so
dynamic distribution lists such as "All Teachers" and "All Parents" always
reach the right personal email addresses.

It runs locally on a Mac, by hand, in two steps:

1. **Fetch:** `fetch-contacts.sh` runs `contacts.sql` with the Supabase CLI
   and saves a cleaned list to `data/contacts.json`.
2. **Apply:** `sync-contacts.ps1` reads that file and brings Exchange into
   line. It is a **dry run unless you pass `-Apply`**.

`setup-lists.ps1` is a one-off that creates or updates the distribution lists.

## Contents

- [How it works](#how-it-works)
- [One-off setup](#one-off-setup)
- [First run checklist](#first-run-checklist)
- [Everyday use](#everyday-use)
- [Distribution lists](#distribution-lists)
- [Adding a new role or list](#adding-a-new-role-or-list)
- [Data protection](#data-protection)
- [Reference](#reference)

## How it works

### Who is synced

Defined in the config block at the top of `contacts.sql`:

| Tag       | Who                                                                    | Contact address        | Also tags user account |
| --------- | ---------------------------------------------------------------------- | ---------------------- | ---------------------- |
| `Teacher` | `staff` with role `teacher` or `headteacher`                           | `staff.personal_email` | Yes: `staff.email`     |
| `Parent`  | `guardians` who are primary or secondary guardian of an active student | `guardians.email`      | No                     |

Notes:

- `staff` has no active/archived flag, so a teacher stays in the list until
  their staff record is removed or their role changes.
- Additional (emergency) contacts are **not** included in the parents list.
- `students.consent_comms_email_sms` is not used as a filter. It is currently
  false for every student, so filtering on it would empty the parents list.
  Decide whether it should apply before relying on it.
- Admins and secretaries are not synced. See
  [Adding a new role or list](#adding-a-new-role-or-list).

### Cleaning (done in SQL)

- Emails are trimmed and lowercased, then checked against a pattern. Rows
  with a missing or invalid email, or no name, are skipped and **counted**.
- Rows are de-duplicated by email, so one person gets one contact.
- If a role query returns 0 rows, the fetch stops and saves nothing.

### People with more than one role

`CustomAttribute1` can only hold one value, and Exchange Online filters don't
allow wildcards at the start of a value (so `-like '*Parent*'` is not an
option). The sync therefore uses one attribute per role:

| Attribute          | Holds                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `CustomAttribute1` | The **primary** tag (highest priority: `Teacher` before `Parent`). Marks the contact as managed by this sync. |
| `CustomAttribute2` | `Teacher` if the person is a teacher, otherwise empty                                                         |
| `CustomAttribute3` | `Parent` if the person is a parent, otherwise empty                                                           |

Lists filter on the **role attribute**, not `CustomAttribute1`, so a teacher
who is also a parent is in both "All Teachers" and "All Parents". Their name
comes from the highest-priority record (their staff record). At the time of
writing, 2 people are both a teacher and a parent.

### What the sync changes

For each person in the data file:

- **No contact with that address:** create one with display name, first
  name, last name, external address, tags, and hidden from the address book.
- **A contact already has that address:** update names and tags if they
  differ, and hide it from the address book. This includes untagged contacts
  such as the teachers imported earlier. They are **adopted**, not duplicated.
- **The address belongs to a mailbox, user or guest:** skipped and reported
  as a conflict.

Removals: a contact is deleted only if its `CustomAttribute1` is one of the
tags in `config.psd1` and its address is no longer in the data.
**Untagged contacts are never removed or changed** (unless their address
appears in the data, which means they are adopted).

User accounts: for teachers, the Microsoft 365 account found at `staff.email`
(a user mailbox, shared mailbox or mail user) gets `CustomAttribute1 = Teacher`
and `CustomAttribute2 = Teacher`, so "All Teachers" reaches both their
personal address and their school account. Any account holding one of our
tags that is no longer in the data has those attributes cleared. Staff emails
with no matching account are skipped and reported. Nothing else on the account
is changed.

### Safety

- **Dry run is the default.** Nothing changes without `-Apply`.
- The run **aborts** if removals would affect more than 20% of managed
  contacts, or 20% of tagged accounts, unless you pass `-Force`.
- The run aborts if the data file is more than 24 hours old, names an unknown
  tag, has an empty role or has no contacts.
- Each change has its own error handling, so one failure doesn't stop the run.
- **Idempotent:** after a successful `-Apply`, the next run plans no changes.
  If some changes failed, re-running retries only what is still out of sync.

## One-off setup

### 1. Install tools

```bash
brew install --cask powershell   # PowerShell 7 (pwsh)
brew install supabase/tap/supabase   # skip if already installed; npx supabase also works
# jq comes with macOS; if it's missing: brew install jq
```

Install the Exchange Online module (and Pester, only needed to run the tests):

```bash
pwsh -c "Install-Module ExchangeOnlineManagement -Scope CurrentUser"
pwsh -c "Install-Module Pester -Scope CurrentUser -MinimumVersion 5.0"
```

### 2. Connect the Supabase CLI

From the repository root:

```bash
supabase login
supabase link   # choose the production project, if not already linked
```

### 3. Create local config

```bash
cd scripts/m365-sync
cp config.example.psd1 config.psd1   # then edit AllowedSenders and list names
cp .env.example .env                 # then set M365_ADMIN_UPN
```

Both files are gitignored.

### 4. Check your Microsoft 365 role

The account you sign in with needs the **Exchange Recipient Administrator**
role (Microsoft 365 admin centre → Roles). **Exchange Administrator** or
**Global Administrator** also work but give more access than needed.

## First run checklist

Run everything from `scripts/m365-sync`.

1. **Fetch** the data and check the counts look right:

   ```bash
   ./fetch-contacts.sh
   ```

2. **Dry run** the sync. A browser window opens to sign in (add `-Device` to
   use a device code instead):

   ```bash
   pwsh ./sync-contacts.ps1
   ```

3. **Review** the plan. On the first run expect:
   - `UPDATE … (adopting existing contact)` for the teachers already imported
   - `ADD` for everyone else
   - no `REMOVE` lines
   - `SKIP account …` for any teacher whose `staff.email` isn't a Microsoft
     365 account

   Emails are masked. Use `pwsh ./sync-contacts.ps1 -ShowEmails` to see them
   in full, but don't copy or share that output.

4. **Apply**:

   ```bash
   pwsh ./sync-contacts.ps1 -Apply
   ```

   This deletes `data/contacts.json` when it succeeds.

5. **Check idempotency**: fetch and dry run again. It should report
   `0 change(s) planned`.

6. **Set up the lists** (dry run, then apply):

   ```bash
   pwsh ./setup-lists.ps1
   pwsh ./setup-lists.ps1 -Apply
   ```

7. **Preview membership** (see [below](#previewing-membership)), then
   **remove the old rules**, as described in the next section.

## Everyday use

Whenever people have changed in the portal (for example weekly, before the
newsletter):

```bash
cd scripts/m365-sync
./fetch-contacts.sh
pwsh ./sync-contacts.ps1          # review
pwsh ./sync-contacts.ps1 -Apply
```

Allow **up to about 24 hours** for dynamic lists to pick up changes.

### Options

| `sync-contacts.ps1`  | Effect                                                   |
| -------------------- | -------------------------------------------------------- |
| _(none)_ / `-DryRun` | Plan only                                                |
| `-Apply`             | Make the changes                                         |
| `-Force`             | Allow removals above `MaxRemovalPercent`                 |
| `-Device`            | Sign in with a device code                               |
| `-ShowEmails`        | Show full addresses on screen (never written to the log) |
| `-KeepData`          | Keep `data/contacts.json` after a successful apply       |
| `-DataPath <file>`   | Use a different data file                                |

Exit codes: `0` success, `1` fatal error, `2` stopped by the removal limit,
`3` finished with some failed changes.

## Distribution lists

`setup-lists.ps1` handles every entry in `Lists` in `config.psd1`. For each
list it:

- restricts sending to `AllowedSenders` (all must exist in Exchange)
- turns on `RequireSenderAuthenticationEnabled` (blocks outside senders)
- hides the list from the address book
- shows how many recipients the list currently matches

**New lists** are created with a filter such as:

```text
(RecipientType -eq 'MailContact') -and (CustomAttribute3 -eq 'Parent')
```

Lists with `IncludeUserAccounts = $true` in `config.psd1` ("All Teachers")
also include the tagged Microsoft 365 accounts:

```text
((RecipientType -eq 'MailContact') -or (RecipientType -eq 'UserMailbox') -or (RecipientType -eq 'MailUser')) -and (CustomAttribute2 -eq 'Teacher')
```

**Lists created in the Exchange admin centre** (for example your existing
"All Teachers") use rules that Exchange can't convert to a custom filter. The
script updates them to equivalent rules instead: _include mail contacts_ (plus
_mailbox users_ and _mail users_ when `IncludeUserAccounts` is set) and
_CustomAttribute2 equals Teacher_. It leaves any other rules alone and warns
you about them.

### Remove the old rules

> **Rules are ANDed.** Once the sync has been applied and every teacher is
> tagged, remove the existing **Company = Teacher** and
> **Department = Teacher** rules from "All Teachers" in the Exchange admin
> centre. Otherwise only contacts that match both the old and new rules will
> be included.

Order matters: apply the sync **first**, then run `setup-lists.ps1 -Apply`,
then remove the old rules.

### Previewing membership

The script prints counts. To look yourself, in `pwsh` after
`Connect-ExchangeOnline`:

```powershell
$list = Get-DynamicDistributionGroup -Identity 'All Teachers'
Get-Recipient -RecipientPreviewFilter $list.RecipientFilter -ResultSize Unlimited |
    Select-Object DisplayName, PrimarySmtpAddress
```

Or preview a filter before creating anything:

```powershell
Get-Recipient -RecipientPreviewFilter "(RecipientType -eq 'MailContact') -and (CustomAttribute3 -eq 'Parent')" -ResultSize Unlimited |
    Measure-Object
```

`pwsh ./setup-lists.ps1 -ShowMembers` prints names and addresses too. That
output contains personal data.

The preview shows who the filter matches **now**. The list that email is
actually delivered to can take up to about 24 hours to catch up.

## Adding a new role or list

Example: an "All Admin Staff" list.

1. **`contacts.sql`**: add the role to `roles` with a priority, and add a
   `SELECT` to `source_rows`:

   ```sql
   roles (tag, priority, tag_user_account) as (
     values
       ('Teacher', 1, true),
       ('Admin', 2, true),
       ('Parent', 3, false)
   ),
   ...
     union all
     select 'Admin', s.id::text, s.first_name, s.last_name, s.personal_email, s.email
     from staff s
     where s.role in ('admin', 'secretary')
   ```

   Tags must be letters and digits only.

2. **`config.psd1`**: add the tag with an unused attribute, and the list:

   ```powershell
   Tags  = @(
       @{ Tag = 'Teacher'; MembershipAttribute = 'CustomAttribute2' }
       @{ Tag = 'Parent'; MembershipAttribute = 'CustomAttribute3' }
       @{ Tag = 'Admin'; MembershipAttribute = 'CustomAttribute4' }
   )
   Lists = @(
       ...
       @{ Name = 'All Admin Staff'; Alias = 'alladminstaff'; Tag = 'Admin' }
   )
   ```

   Keep the existing tags' attributes the same. Changing them breaks
   existing lists.

3. Fetch, dry run, apply, then run `setup-lists.ps1` (dry run, then
   `-Apply`).

Before using a custom attribute, check nothing else in the tenant already uses
it. The sync overwrites the role attributes on every contact it manages.

## Data protection

- Only names and email addresses leave the database. `contacts.sql` selects
  nothing else.
- `data/contacts.json` holds personal data. It is gitignored, readable only by
  you, and deleted after a successful apply. Don't copy it anywhere else.
- Summaries print **counts only**. The detailed plan shows names on screen
  and masks emails (`j***@example.com`) unless you pass `-ShowEmails`, which
  prints a clear warning first.
- Log files (`logs/`, gitignored) contain counts, masked addresses and error
  messages, but no names. Logs older than 30 days are deleted automatically
  (`LogRetentionDays`).
- Contacts are hidden from the address book, so staff can't browse parents'
  addresses in Outlook.

## Reference

### Files

| File                  | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `contacts.sql`        | Role → tag config, selection and cleaning                     |
| `fetch-contacts.sh`   | Runs the SQL and writes `data/contacts.json`                  |
| `sync-contacts.ps1`   | Plans and applies contact changes                             |
| `setup-lists.ps1`     | Creates or updates the dynamic distribution lists             |
| `lib/ContactData.ps1` | Reads and validates the data file                             |
| `lib/Exchange.ps1`    | Reads Exchange, builds the plan, applies it                   |
| `lib/Common.ps1`      | Config, email helpers, logging                                |
| `tests/`              | Pester tests for validation and planning (no Exchange needed) |

Run the tests with:

```bash
pwsh -c "Invoke-Pester ./tests"
```

### Data file format

The data file is the only link between fetching and applying. To run the sync
from a scheduled job or the portal later, produce the same JSON another way
and keep `sync-contacts.ps1` as it is.

```json
{
  "version": 1,
  "generatedAt": "2026-09-17T10:00:00+01:00",
  "roles": [{ "tag": "Teacher", "rows": 15 }],
  "contacts": [
    {
      "email": "name@example.com",
      "firstName": "Jane",
      "lastName": "Doe",
      "tags": ["Teacher", "Parent"]
    }
  ],
  "accounts": [{ "email": "jane.doe@school.example", "tag": "Teacher" }],
  "skipped": [{ "role": "Parent", "reason": "missing email", "count": 18 }],
  "mergedRows": 2
}
```

`tags` must be in priority order: the first one becomes `CustomAttribute1`.

### Moving to an unattended job later

- Swap the interactive sign-in in `Connect-SyncExchange` (`lib/Exchange.ps1`)
  for app-only authentication (`Connect-ExchangeOnline -AppId … -CertificateThumbprint … -Organization …`).
- Replace `fetch-contacts.sh` with anything that writes the same JSON.
- Keep the dry run, removal limit and exit codes as they are. A job can
  alert on exit codes `2` and `3`.
