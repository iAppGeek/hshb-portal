# Registration feature: retention and audit follow-up plan

Branch: `feat/parent-registration-form` (PR #23). Two changes agreed after the
remediation review:

1. **No automatic purge.** Actioned submissions stay in the database until an
   admin deletes them by hand. Remove the purge RPC, the Admin Tasks tab and
   its action, and allow manual delete of actioned rows.
2. **Audit what approval changed.** The approve RPC returns a before-and-after
   record of every guardian it reused or updated and, when linking a returning
   child, the student's previous values. The approve action writes that record
   into the audit log. The review page shows the same old and new values before
   the admin approves.

Work through the tasks in order. Each task ends with a commit.

## Ground rules for the implementer

- Read `.claude/CLAUDE.md` and `AGENTS.md` first. Next.js 16 is in use; check
  `node_modules/next/dist/docs/` before touching anything framework-specific.
- Explicit return types on every function. No `any`; use `unknown` and narrow.
- Every new function gets a `.spec.ts` / `.spec.tsx` beside it. Use
  `vi.mock()`, `vi.spyOn()`, `vi.fn()`; never `jest.*`.
- Imports go in the import block at the top of the file, never mid-file.
- Never edit `src/types/database.ts` by hand. After any migration change, run
  the `gentypes` skill (`npm run gen:types`; needs `supabase start`).
- The hardening migration
  `supabase/migrations/20260909000001_registration_review_hardening.sql` has not
  been applied to any shared environment yet (the branch is unmerged), so edit
  it in place rather than adding a new migration. Mirror every change into
  `supabase/schema.sql`.
- After each task: `npm run fix:all`, then `npx vitest run <changed specs>`.
- Before declaring done: `npm run pipeline:check` must pass end to end.
- No `TODO` comments. Implement or leave out.

## Task order

| #   | Task                                                     |
| --- | -------------------------------------------------------- |
| 1   | Remove the automatic purge                               |
| 2   | Allow admins to delete actioned rows manually            |
| 3   | Approve RPC returns a change record                      |
| 4   | Approve action writes the change record to the audit log |
| 5   | Review page shows old and new values before approval     |

---

## Task 1: Remove the automatic purge

**Why.** Retention is now manual. Registration data must stay until an admin
deletes it.

**Steps.**

1. Migration `20260909000001_registration_review_hardening.sql`: delete the
   whole `purge_actioned_submissions` block (the comment header at line 262
   through the closing `$$ LANGUAGE plpgsql;`). Delete the same block from
   `supabase/schema.sql` (starts at line 804). Run `npm run gen:types` and
   confirm `purge_actioned_submissions` no longer appears in
   `src/types/database.ts`.

2. Delete the directory `src/app/admin/_tabs/registration-retention/` and all
   six files in it.

3. `src/app/admin/_components/AdminTabBar.tsx` line 10: remove the
   `registration-retention` tab entry. `AdminTabBar.spec.tsx` lines 32-34:
   remove the test for that tab.

4. `src/app/admin/page.tsx`: remove the import on line 11 and the render on
   line 45. `src/app/admin/page.spec.tsx`: remove the mock at lines 21-23 and
   the two tests at lines 102 and 105-112.

5. `src/db/registrations.ts`: remove `purgeActionedSubmissions` (lines 178
   onward) and the `SUBMISSION_RETENTION_DAYS` import on line 3.
   `src/db/index.ts` line 37: remove the export.
   `src/db/registrations.spec.ts`: remove the import on line 12 and the
   `describe('purgeActionedSubmissions')` block starting at line 282.

6. `src/lib/registration.ts`: remove `SUBMISSION_RETENTION_DAYS` and its
   comment (lines 5-9). Check `src/lib/registration.spec.ts` for a matching
   test and remove it.

7. `src/db/audit-log.ts` line 19: remove `'submissions_purged'` from
   `AuditAction`.

8. `README.md` line 151: replace with
   "Actioned submissions and opt-out requests are kept until an admin deletes
   them from the review page. There is no automatic purge."

9. `plans/registration-review-remediation.md`: add a note at the top of
   Task 7 saying it was reverted by this plan. Do not delete the task text.

**Tests.** Existing suites must pass after the removals. Run
`npx vitest run src/app/admin src/db/registrations.spec.ts src/lib`.

**Done when.** `grep -rni "purge\|SUBMISSION_RETENTION" src supabase README.md`
returns nothing.

---

## Task 2: Allow admins to delete actioned rows manually

**Why.** With no purge, the only way to remove staging data is the Delete
button, which is currently hidden and blocked for actioned rows.

**Steps.**

1. `src/db/registrations.ts` `deleteRegistrationSubmission` (around line 165):
   remove the `.neq('status', 'actioned')` line. Change the thrown message to
   `'Submission not found'`.

2. `src/db/photoOptOuts.ts` `deletePhotoOptOut` (around line 115): remove the
   `.neq('status', 'actioned')` line. Change the thrown message to
   `'Request not found'`.

3. `src/app/registrations/[id]/RegistrationReview.tsx` line 59: change
   `const canDelete = isAdmin && submission.status !== 'actioned'` to
   `const canDelete = isAdmin`.
   In the confirm block (around line 284), make the warning status-aware.
   When `submission.status === 'actioned'` show:
   "Delete this registration record permanently? The student and guardian
   records created from it are not affected. This cannot be undone."
   Otherwise keep the existing text.

4. `src/app/registrations/PhotoOptOutSection.tsx` line 85: the whole action
   cell is gated on `canAct` (pending only). Split it: keep "Match & apply"
   and "Reject" behind `canAct`, and show "Delete" whenever `isAdmin`. Make
   the confirm text at line 154 status-aware in the same way: for actioned
   rows say "The student's consent flag is not affected."

5. The audit entries for both delete actions already record the child's name
   (`registration_deleted`, `photo_opt_out_deleted`). Add `status` to the
   `details` object in `deleteRegistrationAction`
   (`src/app/registrations/actions.ts`) and `deletePhotoOptOutAction`
   (`src/app/registrations/photo-opt-out-actions.ts`), taken from the row
   fetched just before deletion, so the log shows whether an actioned record
   was removed.

**Tests.**

- `src/db/registrations.spec.ts` line 277 and `src/db/photoOptOuts.spec.ts`
  line 239: these assert the "cannot be deleted" message. Update them to the
  new message and remove any test that asserts the `.neq` filter is applied.
- `src/app/registrations/[id]/RegistrationReview.spec.tsx` line 127
  "hides action buttons entirely for admin once a submission is actioned":
  change to assert Approve and Reject are hidden and Delete is visible. Add a
  test that the actioned-specific confirm text appears.
- `src/app/registrations/PhotoOptOutSection.spec.tsx` line 89: same change.
- Action specs: assert `status` is included in the audit `details`.
- `e2e/tests/registrations/review.e2e.ts`: add
  "deletes an actioned submission from the review page". Create a submission
  via the fixture, approve it as a new student, return to the review page,
  click Delete, confirm, then assert the submission row is gone and the
  student row still exists. Clean up the student in `afterEach` (the existing
  `afterEach` at line 20 already deletes students by last name).

**Done when.** An admin can delete a submission or opt-out request in any
status from the UI, and the audit log records the status at deletion.

---

## Task 3: Approve RPC returns a change record

**Why.** Guardian reuse updates phone, email and address inside the RPC with
no trace. Linking a returning child overwrites the student row the same way.
The audit log must show old and new values for both.

**Design.** `approve_registration` returns `JSON` instead of `UUID`, following
`migrate_class` (see `supabase/schema.sql` line 311, which returns
`json_build_object(...)`). Shape:

```json
{
  "student_id": "uuid",
  "linked_existing": false,
  "guardians": [
    {
      "contact_role": "primary",
      "guardian_id": "uuid",
      "reused": true,
      "matched_on": "email",
      "changes": {
        "phone": { "old": "07700 900333", "new": "07700 900000" },
        "address_line_1": {
          "old": "Old Guardian Address",
          "new": "1 Fixture St"
        }
      }
    },
    {
      "contact_role": "secondary",
      "guardian_id": "uuid",
      "reused": false,
      "matched_on": null,
      "changes": {}
    }
  ],
  "student_changes": {
    "first_name": { "old": "Alice", "new": "Alicia" }
  }
}
```

`changes` and `student_changes` include only fields whose value actually
changed (`IS DISTINCT FROM`). For a newly created guardian, `changes` is `{}`.
For a newly created student, `student_changes` is `{}`.

**Steps.** All edits are inside the `approve_registration` body in the
hardening migration; mirror the final function into `supabase/schema.sql`
(replace the version at line 501).

1. Change `RETURNS UUID` to `RETURNS JSON`.

2. Add to `DECLARE`:

```sql
  v_old_g      guardians%ROWTYPE;
  v_old_s      students%ROWTYPE;
  v_matched_on TEXT;
  v_gchanges   JSONB;
  v_guardians  JSONB := '[]'::JSONB;
  v_schanges   JSONB := '{}'::JSONB;
```

3. In the contact loop, record how the match was made. Replace the two lookup
   `IF` blocks with:

```sql
    v_gid := NULL; v_matched_on := NULL;
    IF p_reuse_guardians AND v_con.email IS NOT NULL THEN
      SELECT id INTO v_gid FROM guardians WHERE LOWER(email) = LOWER(v_con.email) LIMIT 1;
      IF v_gid IS NOT NULL THEN v_matched_on := 'email'; END IF;
    END IF;
    IF p_reuse_guardians AND v_gid IS NULL THEN
      SELECT id INTO v_gid FROM guardians
       WHERE regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_con.phone, '\D', '', 'g')
         AND LOWER(last_name) = LOWER(v_con.last_name)
       LIMIT 1;
      IF v_gid IS NOT NULL THEN v_matched_on := 'phone'; END IF;
    END IF;
    v_reused := (v_gid IS NOT NULL);
```

4. In the reuse branch (`IF v_reused AND p_reuse_guardians THEN`), snapshot
   the row before the `UPDATE`, then build the diff after it. Replace the
   block with:

```sql
    v_gchanges := '{}'::JSONB;
    IF v_reused THEN
      SELECT * INTO v_old_g FROM guardians WHERE id = v_gid FOR UPDATE;

      UPDATE guardians SET
        phone          = v_con.phone,
        email          = COALESCE(v_con.email, email),
        address_line_1 = CASE WHEN v_con.same_as_child_address THEN v_sub.address_line_1 ELSE COALESCE(v_con.address_line_1, address_line_1) END,
        address_line_2 = CASE WHEN v_con.same_as_child_address THEN v_sub.address_line_2 ELSE COALESCE(v_con.address_line_2, address_line_2) END,
        city           = CASE WHEN v_con.same_as_child_address THEN v_sub.city           ELSE COALESCE(v_con.city, city)           END,
        postcode       = CASE WHEN v_con.same_as_child_address THEN v_sub.postcode       ELSE COALESCE(v_con.postcode, postcode)   END
      WHERE id = v_gid;

      SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('old', o, 'new', n)), '{}'::JSONB)
        INTO v_gchanges
      FROM (
        SELECT * FROM (VALUES
          ('phone',          v_old_g.phone,          g.phone),
          ('email',          v_old_g.email,          g.email),
          ('address_line_1', v_old_g.address_line_1, g.address_line_1),
          ('address_line_2', v_old_g.address_line_2, g.address_line_2),
          ('city',           v_old_g.city,           g.city),
          ('postcode',       v_old_g.postcode,       g.postcode)
        ) AS t(k, o, n)
        CROSS JOIN (SELECT * FROM guardians WHERE id = v_gid) AS g
        WHERE t.o IS DISTINCT FROM t.n
      ) AS d;
    END IF;

    v_guardians := v_guardians || jsonb_build_object(
      'contact_role', v_con.contact_role,
      'guardian_id',  v_gid,
      'reused',       v_reused,
      'matched_on',   v_matched_on,
      'changes',      v_gchanges
    );
```

Note the `VALUES` list references `g.*` columns from the `CROSS JOIN`;
Postgres allows a lateral reference here because `VALUES` in a `FROM`
subquery cannot see `g`. If the planner rejects it, rewrite as a
`SELECT ... FROM guardians g WHERE g.id = v_gid` producing the six
`(k, o, n)` rows via `UNNEST(ARRAY[...], ARRAY[...], ARRAY[...])`. Either
form is acceptable; test it against local Supabase before moving on.

5. In the returning-child branch (`ELSE` of `IF p_existing_student_id IS NULL`),
   snapshot the student before the `UPDATE` and diff after it. Insert before
   the `UPDATE students SET`:

```sql
    SELECT * INTO v_old_s FROM students WHERE id = p_existing_student_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Existing student not found';
    END IF;
```

and after the `UPDATE ... RETURNING id INTO v_student_id;` replace the
existing `IF v_student_id IS NULL` check with the diff:

```sql
    SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('old', o, 'new', n)), '{}'::JSONB)
      INTO v_schanges
    FROM (
      SELECT k, o, n FROM UNNEST(
        ARRAY['first_name','last_name','date_of_birth','address_line_1','address_line_2','city','postcode',
              'allergies','medical_details','student_code',
              'primary_guardian_id','secondary_guardian_id','additional_contact_1_id','additional_contact_2_id',
              'consent_privacy_notice','consent_emergency_first_aid','consent_photo_media','consent_home_school','consent_comms_email_sms',
              'active'],
        ARRAY[v_old_s.first_name, v_old_s.last_name, v_old_s.date_of_birth::TEXT, v_old_s.address_line_1, v_old_s.address_line_2, v_old_s.city, v_old_s.postcode,
              v_old_s.allergies, v_old_s.medical_details, v_old_s.student_code,
              v_old_s.primary_guardian_id::TEXT, v_old_s.secondary_guardian_id::TEXT, v_old_s.additional_contact_1_id::TEXT, v_old_s.additional_contact_2_id::TEXT,
              v_old_s.consent_privacy_notice::TEXT, v_old_s.consent_emergency_first_aid::TEXT, v_old_s.consent_photo_media::TEXT, v_old_s.consent_home_school::TEXT, v_old_s.consent_comms_email_sms::TEXT,
              v_old_s.active::TEXT],
        ARRAY[s.first_name, s.last_name, s.date_of_birth::TEXT, s.address_line_1, s.address_line_2, s.city, s.postcode,
              s.allergies, s.medical_details, s.student_code,
              s.primary_guardian_id::TEXT, s.secondary_guardian_id::TEXT, s.additional_contact_1_id::TEXT, s.additional_contact_2_id::TEXT,
              s.consent_privacy_notice::TEXT, s.consent_emergency_first_aid::TEXT, s.consent_photo_media::TEXT, s.consent_home_school::TEXT, s.consent_comms_email_sms::TEXT,
              s.active::TEXT]
      ) AS t(k, o, n), students s
      WHERE s.id = v_student_id AND t.o IS DISTINCT FROM t.n
    ) AS d;
```

All values are cast to `TEXT` so the three arrays share one type. That is
acceptable for an audit record.

6. Replace `RETURN v_student_id;` with:

```sql
  RETURN json_build_object(
    'student_id',      v_student_id,
    'linked_existing', (p_existing_student_id IS NOT NULL),
    'guardians',       v_guardians,
    'student_changes', v_schanges
  );
```

7. Run `npm run gen:types`. `Database['public']['Functions']['approve_registration']['Returns']`
   becomes `Json`.

8. `src/db/registrations.ts`: add and export the result type, and change
   `approveRegistration` to return it.

```ts
export type GuardianChange = {
  contact_role: ContactRole
  guardian_id: string
  reused: boolean
  matched_on: 'email' | 'phone' | null
  changes: Record<string, { old: string | null; new: string | null }>
}

export type ApproveRegistrationResult = {
  student_id: string
  linked_existing: boolean
  guardians: GuardianChange[]
  student_changes: Record<string, { old: string | null; new: string | null }>
}
```

The function signature becomes
`Promise<ApproveRegistrationResult>` and the final line
`return data as ApproveRegistrationResult`. Export the two types from
`src/db/index.ts` in the registrations block.

**Tests.**

- `src/db/registrations.spec.ts` `approveRegistration`: the rpc mock resolves
  with a full result object; assert it is returned unchanged.
- Verify the SQL against local Supabase before writing the TypeScript. A quick
  manual check: `supabase db reset`, then in `psql` call
  `SELECT approve_registration('<seed pending id>', '<seed admin staff id>');`
  and confirm the JSON shape. The seed pending submission id is
  `80000000-0000-0000-0000-000000000001` (see `supabase/seed.sql`).

**Done when.** The RPC returns the JSON shape above and the data layer types
it.

---

## Task 4: Approve action writes the change record to the audit log

**Steps.**

1. `src/app/registrations/actions.ts` `approveRegistrationAction`: the call
   now returns an object. Replace `let studentId: string` and the assignment
   with:

```ts
  let result: ApproveRegistrationResult
  try {
    result = await approveRegistration({ ... })
```

Import the type from `@/db` in the existing import (as a type import).

2. Change the audit `details` to:

```ts
      details: {
        studentId: result.student_id,
        linkedExisting: result.linked_existing,
        classId: parsed.data.class_id,
        reuseGuardians: parsed.data.reuse_guardians,
        guardians: result.guardians,
        studentChanges: result.student_changes,
      },
```

3. Change the redirect to use `result.student_id`.

**Tests.**

- `src/app/registrations/actions.spec.ts`: the `approveRegistration` mock
  must now resolve with a result object. Update lines 122-175 and 177-208
  accordingly. The success test at line 143 asserts the exact `details`
  object; extend it with `guardians` and `studentChanges`. Add one test with
  a reused guardian that has a phone change and assert it appears verbatim in
  `details.guardians[0].changes.phone`.
- `e2e/tests/registrations/review.e2e.ts` "shows a guardian match warning and
  reuses the guardian on approve" (line 238): after the approval, query
  `audit_log` for `action = 'registration_approved'` and `entity_id = id`,
  and assert `details.guardians[0].reused === true` and
  `details.guardians[0].changes.phone.old === '07700 900333'`.

**Done when.** The audit row for an approval contains every guardian and
student field the RPC changed, with old and new values.

---

## Task 5: Review page shows old and new values before approval

**Why.** The admin should see exactly what "reuse" will change before
approving, not only after in the audit log.

**Steps.**

1. `find_guardian_matches` already returns the existing guardian's phone and
   email. Extend it to also return the address so the page can show the full
   diff. In the hardening migration and `supabase/schema.sql`, add
   `address_line_1 TEXT, address_line_2 TEXT, city TEXT, postcode TEXT` to
   the `RETURNS TABLE` list and select `g.address_line_1, g.address_line_2,
g.city, g.postcode` in both `SELECT` branches (before the `matched_on`
   literal). Run `npm run gen:types`. Add the four fields to `GuardianMatch`
   in `src/db/guardians.ts`.

2. Add a pure helper `src/lib/guardianDiff.ts`:

```ts
import type { GuardianMatch } from '@/db'
import type { Tables } from '@/types/database'

type Contact = Tables<'registration_submission_contacts'>
type Submission = Pick<
  Tables<'registration_submissions'>,
  'address_line_1' | 'address_line_2' | 'city' | 'postcode'
>

export type FieldDiff = {
  field: string
  old: string | null
  new: string | null
}

// Mirrors the UPDATE in approve_registration's reuse branch so the page shows
// exactly what approval will write.
export function guardianReuseDiff(
  match: GuardianMatch,
  contact: Contact,
  submission: Submission,
): FieldDiff[] {
  const same = contact.same_as_child_address
  const next = {
    phone: contact.phone,
    email: contact.email ?? match.email,
    address_line_1: same
      ? submission.address_line_1
      : (contact.address_line_1 ?? match.address_line_1),
    address_line_2: same
      ? submission.address_line_2
      : (contact.address_line_2 ?? match.address_line_2),
    city: same ? submission.city : (contact.city ?? match.city),
    postcode: same ? submission.postcode : (contact.postcode ?? match.postcode),
  }
  return (Object.keys(next) as (keyof typeof next)[])
    .filter((k) => (match[k] ?? null) !== (next[k] ?? null))
    .map((k) => ({ field: k, old: match[k] ?? null, new: next[k] ?? null }))
}
```

The import of `GuardianMatch` from `@/db` is type-only, so it is allowed
in a file that client components import (see `stripTypeImports` in
`src/security.spec.ts`).

3. `src/app/registrations/[id]/RegistrationReview.tsx`: in the amber match
   note (around line 143), call `guardianReuseDiff(m, contact, submission)`
   and render the result under the existing sentence as a small definition
   list, one row per field: field label, old value, new value. Use
   "(empty)" for null. If the list is empty render
   "No contact details will change." Keep the existing sentence.

4. Field labels: reuse a small map in the same component:
   `phone` → "Phone", `email` → "Email", `address_line_1` → "Address line 1",
   `address_line_2` → "Address line 2", `city` → "City", `postcode` → "Postcode".

**Tests.**

- `src/lib/guardianDiff.spec.ts`: no changes when values match; phone change
  only; address taken from the submission when `same_as_child_address` is
  true; address taken from the contact when false and the contact supplied
  it; existing guardian address kept when the contact left it blank; email
  kept when the contact has none.
- `src/app/registrations/[id]/RegistrationReview.spec.tsx`: with a match
  whose phone differs, the note lists "Phone", the old value and the new
  value. With an identical match, it shows "No contact details will change."
- `src/db/guardians.spec.ts`: no change needed unless it asserts the exact
  returned shape.

**Done when.** The review page shows, per matched contact, the exact field
changes approval will make, and those match what the RPC then records.

---

## Final verification

1. `supabase db reset` applies cleanly.
2. `npm run gen:types` produces a diff that only removes
   `purge_actioned_submissions`, changes the `approve_registration` return
   type, and adds the address fields to `find_guardian_matches`.
3. `npm run fix:all`.
4. `npm run pipeline:check` passes: lint → format:check → type-check →
   test:coverage → test:e2e → build.
5. Commit each task separately, e.g.
   `revert(admin): remove automatic purge of actioned submissions`,
   `feat(registrations): allow manual delete of actioned rows`,
   `feat(registrations): approve RPC returns guardian and student change record`,
   `feat(registrations): audit guardian and student changes on approval`,
   `feat(registrations): show reuse field changes on the review page`.
6. Push to `feat/parent-registration-form` so PR #23 picks up the commits.
