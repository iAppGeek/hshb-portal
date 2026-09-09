# Registration feature: review remediation plan

Branch: `feat/parent-registration-form`. This plan fixes every finding from the
senior review of the public registration form and photo-consent opt-out work.
Work through the tasks in order. Each task is self-contained and ends with a
commit. Do not skip the tests listed under each task.

## Ground rules for the implementer

- Read `.claude/CLAUDE.md` and `AGENTS.md` first. Next.js 16 is in use; check
  `node_modules/next/dist/docs/` before touching anything framework-specific.
- Explicit return types on every function. No `any`; use `unknown` and narrow.
- Every new function gets a `.spec.ts` / `.spec.tsx` beside it. Use
  `vi.mock()`, `vi.spyOn()`, `vi.fn()`; never `jest.*`.
- Imports go in the import block at the top of the file, never mid-file.
- Never edit `src/types/database.ts` by hand. After any migration change, run
  the `gentypes` skill (`npm run gen:types`; needs `supabase start`).
- Database changes go in a **new** migration file
  `supabase/migrations/20260909000001_registration_review_hardening.sql` and
  must also be mirrored into `supabase/schema.sql` in the matching section.
- After each task: `npm run fix:all`, then `npx vitest run <changed specs>`.
- Before declaring done: `npm run pipeline:check` must pass end to end.
- No `TODO` comments. Implement or leave out.

## Task order

| #   | Task                                                                                               | Severity |
| --- | -------------------------------------------------------------------------------------------------- | -------- |
| 1   | Replace string-built PostgREST filter with an RPC                                                  | Must     |
| 2   | Remove pre-ticked photo consent                                                                    | Must     |
| 3   | Add length limits to all public form fields                                                        | Must     |
| 4   | Surface guardian de-dup matches; let admin choose reuse vs create; refresh reused guardian details | Should   |
| 5   | Require a session in every server action outside `/register`; add a guard test                     | Should   |
| 6   | Make registration insert atomic via an RPC                                                         | Should   |
| 7   | Retention: purge actioned submissions from Admin Tasks                                             | Should   |
| 8   | Validate the `status` query param on the inbox page                                                | Should   |
| 9   | Turnstile: send `remoteip`, optionally verify `hostname`                                           | Should   |
| 10  | Replace `staffId!` assertions with an explicit error                                               | Quality  |
| 11  | Clean up the new lint warning                                                                      | Quality  |

---

## Task 1: Replace string-built PostgREST filter with an RPC

**Problem.** `findStudentMatches` in [src/db/students.ts:224-240](../src/db/students.ts#L224-L240)
interpolates `firstName` (which originates from the public form) into a
`.or()` filter string:

```ts
.or(`date_of_birth.eq.${dateOfBirth},first_name.ilike.${firstName}`)
```

A first name containing `,`, `(`, `)` or `*` changes the query, and PostgREST
treats `*` as a wildcard in `ilike`. Errors are discarded (`const { data }`),
so bad input silently returns no matches. Move the matching into a
parameterised SQL function so no user text is ever concatenated into a filter.

**Steps.**

1. In the new migration file, add:

```sql
-- ─── find_student_matches RPC ────────────────────────────────────────────────
-- Case-insensitive exact match on last name, plus either the same DOB or the
-- same first name. Includes inactive students so returning children can be
-- linked and reactivated. Parameterised so form-supplied text is never
-- interpolated into a PostgREST filter string.
CREATE OR REPLACE FUNCTION find_student_matches(
  p_first_name    TEXT,
  p_last_name     TEXT,
  p_date_of_birth DATE
) RETURNS TABLE (
  id             UUID,
  first_name     TEXT,
  last_name      TEXT,
  date_of_birth  DATE,
  student_code   TEXT,
  active         BOOLEAN
) AS $$
  SELECT s.id, s.first_name, s.last_name, s.date_of_birth, s.student_code, s.active
  FROM students s
  WHERE LOWER(s.last_name) = LOWER(p_last_name)
    AND (s.date_of_birth = p_date_of_birth OR LOWER(s.first_name) = LOWER(p_first_name))
  ORDER BY s.active DESC, s.last_name, s.first_name
  LIMIT 10;
$$ LANGUAGE sql STABLE;
```

2. Mirror the function into `supabase/schema.sql` next to the other RPCs.
3. Run `npm run gen:types`. Confirm `Database['public']['Functions']['find_student_matches']` now exists in `src/types/database.ts`.
4. Rewrite `findStudentMatches` in `src/db/students.ts` to call the RPC. Keep the exported signature and the `StudentMatch` type unchanged:

```ts
export async function findStudentMatches({
  firstName,
  lastName,
  dateOfBirth,
}: {
  firstName: string
  lastName: string
  dateOfBirth: string
}): Promise<StudentMatch[]> {
  const { data, error } = await supabase.rpc('find_student_matches', {
    p_first_name: firstName,
    p_last_name: lastName,
    p_date_of_birth: dateOfBirth,
  })
  if (error) throw error
  return (data ?? []) as StudentMatch[]
}
```

Note: `date_of_birth` comes back typed as `string` from the generated types, which matches `StudentMatch`.

5. Because the function now throws instead of swallowing errors, wrap the two call sites so a matching failure does not take down the page:
   - [src/app/registrations/page.tsx:53-66](../src/app/registrations/page.tsx#L53-L66)
   - [src/app/registrations/[id]/page.tsx:39-48](../src/app/registrations/[id]/page.tsx#L39-L48)

   Use `.catch(() => [] as StudentMatch[])` on the promise and `console.error` the failure. The review must still render when matching fails.

**Tests.**

- Update `describe('findStudentMatches')` in `src/db/students.spec.ts` (line 533). Mock `supabase.rpc` the same way `src/db/registrations.spec.ts` does for `approveRegistration` (line 196). Cover: passes the three args through; returns `[]` when data is null; throws the rpc error.
- Add a case to `src/app/registrations/page.spec.tsx` and `src/app/registrations/[id]/page.spec.tsx`: when `findStudentMatches` rejects, the page still renders and shows "No existing students match."

**Done when.** No `.or(` call anywhere in `src/db/` takes a template literal containing a variable. `grep -rn '\.or(`' src/db` returns nothing.

---

## Task 2: Remove pre-ticked photo consent

**Problem.** [src/app/register/RegistrationForm.tsx:189](../src/app/register/RegistrationForm.tsx#L189)
renders `<Checkbox name="consent_photo_media" defaultChecked>`. Under UK GDPR a
pre-ticked box is not valid consent. It also contradicts the `students` column
default of `FALSE`.

**Steps.**

1. Remove `defaultChecked` from that checkbox.
2. Rewrite the label to a plain affirmative statement:
   "I consent to my child's photo being used on social media, the school website and promotional material. You can withdraw this at any time via the school office."
3. Update the comment at the top of `supabase/migrations/20260908000001_add_photo_consent_opt_outs.sql` (lines 4-6) and the matching comment in `supabase/schema.sql`. They currently say the public form defaults consent to ticked. Change to: "The public form leaves photo consent unticked by default; this form is for families who consented at registration and later withdraw."
4. Check `plans/parent-registration-form.md` and `plans/parent-consent-link.md` for the same claim and correct it.

**Tests.**

- In `src/app/register/RegistrationForm.spec.tsx`, add: "photo consent checkbox is unchecked by default" (`expect(checkbox).not.toBeChecked()`).
- In `e2e/tests/registrations/public-form.e2e.ts`, the happy-path test must not rely on photo consent being ticked. If the DB assertion checks `consent_photo_media`, expect `false` unless the test ticks it.

**Done when.** `grep -n defaultChecked src/app/register/RegistrationForm.tsx` shows no consent field with a truthy default.

---

## Task 3: Add length limits to all public form fields

**Problem.** No field in `registrationContactSchema`, `registrationSubmissionSchema`
or `photoOptOutSchema` ([src/lib/schemas.ts:246-310](../src/lib/schemas.ts#L246-L310))
has a `.max()`. Anonymous users can store arbitrarily large text.

**Steps.**

1. In `src/lib/schemas.ts`, under "Reusable field schemas", add bounded helpers. Do **not** change `requiredString` or `optionalString`; they are shared with authenticated forms.

```ts
export const SHORT_TEXT_MAX = 100
export const ADDRESS_TEXT_MAX = 200
export const LONG_TEXT_MAX = 2000
export const PHONE_MAX = 20
export const EMAIL_MAX = 254

const tooLong = (max: number) => `Must be ${max} characters or fewer`

export const shortText = requiredString.max(
  SHORT_TEXT_MAX,
  tooLong(SHORT_TEXT_MAX),
)
export const optionalShortText = z
  .string()
  .trim()
  .max(SHORT_TEXT_MAX, tooLong(SHORT_TEXT_MAX))
  .transform((v) => v || null)
  .nullable()
export const optionalAddressText = z
  .string()
  .trim()
  .max(ADDRESS_TEXT_MAX, tooLong(ADDRESS_TEXT_MAX))
  .transform((v) => v || null)
  .nullable()
export const addressText = requiredString.max(
  ADDRESS_TEXT_MAX,
  tooLong(ADDRESS_TEXT_MAX),
)
export const optionalLongText = z
  .string()
  .trim()
  .max(LONG_TEXT_MAX, tooLong(LONG_TEXT_MAX))
  .transform((v) => v || null)
  .nullable()
export const boundedUkPhone = ukPhone.max(PHONE_MAX, tooLong(PHONE_MAX))
export const boundedOptionalEmail = z
  .string()
  .trim()
  .max(EMAIL_MAX, tooLong(EMAIL_MAX))
  .transform((v) => v || null)
  .nullable()
  .pipe(z.string().email('Invalid email').nullable())
```

2. Apply them:

   `registrationContactSchema`: `first_name`, `last_name` → `shortText`; `relationship` → `optionalShortText`; `phone` → `boundedUkPhone`; `email` → `boundedOptionalEmail`; `address_line_1`, `address_line_2`, `city`, `postcode` → `optionalAddressText`.

   `registrationSubmissionSchema`: `child_first_name`, `child_last_name`, `declaration_name` → `shortText`; `preferred_year_group` → `optionalShortText`; `address_line_1`, `city`, `postcode` → `addressText`; `address_line_2` → `optionalAddressText`; `allergies`, `medical_details`, `collect_authorised`, `collect_password` → `optionalLongText` (keep the trailing `.optional()` on the two `collect_*` fields).

   `photoOptOutSchema`: `child_first_name`, `child_last_name`, `declaration_name` → `shortText`; `notes` → `optionalLongText`.

   Leave `turnstile_token` as `requiredString` but add `.max(2048)`; Turnstile tokens are well under that.

3. Add matching `maxLength` attributes in the form components so users get inline feedback. Extend the `Field` and `TextArea` helpers in `src/app/register/RegistrationForm.tsx` and `src/app/register/photo-opt-out/PhotoOptOutForm.tsx` with an optional `maxLength?: number` prop and pass the constants from `@/lib/schemas`. Import the constants at the top of each file.

**Tests.**

- `src/lib/schemas.spec.ts`: in each of the three `describe` blocks (lines 614, 658, 781), add one test per bounded field type proving a value of `max + 1` characters fails with the "characters or fewer" message and a value of exactly `max` passes.
- `src/app/register/RegistrationForm.spec.tsx` and `PhotoOptOutForm.spec.tsx`: assert `child_first_name` has `maxLength` equal to `SHORT_TEXT_MAX`.

**Done when.** Every string field in the three public schemas has a `.max()`.

---

## Task 4: Surface guardian de-dup matches; let the admin choose; refresh reused guardians

**Problem.** `approve_registration` in
[supabase/migrations/20260906000001_add_registration_submissions.sql:118-127](../supabase/migrations/20260906000001_add_registration_submissions.sql#L118-L127)
silently reuses an existing guardian when the submitted email matches
(case-insensitive) or the digits-only phone plus last name match. The review
page never shows this, so an outsider who knows a parent's email can attach a
fabricated child to that parent's record. Reused guardians also keep their old
phone and address, so genuine updates are lost.

**Design.** Add a `find_guardian_matches` RPC that applies exactly the same
rule as the approve RPC. Show the result per contact on the review page. Add a
"Reuse matching guardian records" checkbox to the approve dialog (default on).
Pass it through to `approve_registration` as `p_reuse_guardians`. When reusing,
refresh the guardian's phone and address from the submission.

**Steps.**

1. Migration: add the matching RPC.

```sql
-- ─── find_guardian_matches RPC ───────────────────────────────────────────────
-- Same rule approve_registration uses to de-dupe: case-insensitive email, else
-- digits-only phone + case-insensitive last name. Surfaced on the review page
-- so an admin can see which contacts would be linked to an existing guardian.
CREATE OR REPLACE FUNCTION find_guardian_matches(
  p_email     TEXT,
  p_phone     TEXT,
  p_last_name TEXT
) RETURNS TABLE (
  id         UUID,
  first_name TEXT,
  last_name  TEXT,
  phone      TEXT,
  email      TEXT,
  matched_on TEXT
) AS $$
  SELECT g.id, g.first_name, g.last_name, g.phone, g.email, 'email'::TEXT
  FROM guardians g
  WHERE p_email IS NOT NULL AND LOWER(g.email) = LOWER(p_email)
  UNION ALL
  SELECT g.id, g.first_name, g.last_name, g.phone, g.email, 'phone'::TEXT
  FROM guardians g
  WHERE regexp_replace(g.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
    AND LOWER(g.last_name) = LOWER(p_last_name)
    AND NOT (p_email IS NOT NULL AND LOWER(g.email) = LOWER(p_email))
  LIMIT 5;
$$ LANGUAGE sql STABLE;
```

2. Migration: replace `approve_registration` with a version that takes `p_reuse_guardians BOOLEAN DEFAULT TRUE`. Use `CREATE OR REPLACE FUNCTION approve_registration(...)` with the full body copied from the original migration, then apply these changes only:
   - Add the parameter after `p_existing_student_id`:
     ```sql
     p_existing_student_id UUID DEFAULT NULL,
     p_reuse_guardians     BOOLEAN DEFAULT TRUE
     ```
   - Wrap both de-dup lookups so they run only when reuse is on:
     ```sql
     IF p_reuse_guardians AND v_con.email IS NOT NULL THEN
       SELECT id INTO v_gid FROM guardians WHERE LOWER(email) = LOWER(v_con.email) LIMIT 1;
     END IF;
     IF p_reuse_guardians AND v_gid IS NULL THEN
       SELECT id INTO v_gid FROM guardians
        WHERE regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_con.phone, '\D', '', 'g')
          AND LOWER(last_name) = LOWER(v_con.last_name)
        LIMIT 1;
     END IF;
     ```
   - After the `IF v_gid IS NULL THEN INSERT ... END IF;` block, add the refresh for the reuse case:
     ```sql
     IF v_gid IS NOT NULL AND p_reuse_guardians THEN
       -- Reused guardian: the parent's latest submission is the newest statement
       -- of their contact details, so refresh phone and address.
       UPDATE guardians SET
         phone          = v_con.phone,
         email          = COALESCE(v_con.email, email),
         address_line_1 = CASE WHEN v_con.same_as_child_address THEN v_sub.address_line_1 ELSE COALESCE(v_con.address_line_1, address_line_1) END,
         address_line_2 = CASE WHEN v_con.same_as_child_address THEN v_sub.address_line_2 ELSE COALESCE(v_con.address_line_2, address_line_2) END,
         city           = CASE WHEN v_con.same_as_child_address THEN v_sub.city           ELSE COALESCE(v_con.city, city)           END,
         postcode       = CASE WHEN v_con.same_as_child_address THEN v_sub.postcode       ELSE COALESCE(v_con.postcode, postcode)   END
       WHERE id = v_gid;
     END IF;
     ```
     Careful: this must be placed so it runs only when the guardian came from a match, not from the INSERT you just did. The simplest way is a local `v_reused BOOLEAN` set to `TRUE` when either lookup found a row and `FALSE` before the INSERT; test `IF v_reused THEN`.

   Because the function signature changes, Postgres will create an overload rather than replace it. Add `DROP FUNCTION IF EXISTS approve_registration(UUID, UUID, TEXT, UUID, UUID);` before the `CREATE OR REPLACE`.

3. Mirror both functions into `supabase/schema.sql` (replace the existing `approve_registration` there). Run `npm run gen:types`.

4. Data layer, `src/db/guardians.ts`: add

```ts
export type GuardianMatch = {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  matched_on: 'email' | 'phone'
}

export async function findGuardianMatches({
  email,
  phone,
  lastName,
}: {
  email: string | null
  phone: string
  lastName: string
}): Promise<GuardianMatch[]> {
  const { data, error } = await supabase.rpc('find_guardian_matches', {
    p_email: email ?? undefined,
    p_phone: phone,
    p_last_name: lastName,
  })
  if (error) throw error
  return (data ?? []) as GuardianMatch[]
}
```

Export it and the type from `src/db/index.ts` in the guardians block.

5. `src/db/registrations.ts`: add `reuseGuardians: boolean` to `ApproveRegistrationInput` and pass `p_reuse_guardians: reuseGuardians` to the rpc call.

6. `src/lib/schemas.ts`: add `reuse_guardians: checkbox` to `approveRegistrationSchema`.

7. `src/app/registrations/actions.ts` `approveRegistrationAction`: pass `reuseGuardians: parsed.data.reuse_guardians` and add `reuseGuardians` to the audit `details`.

8. `src/app/registrations/[id]/page.tsx`: for admins, after loading the submission, compute guardian matches for every contact:

```ts
const guardianMatchesByContact: Record<string, GuardianMatch[]> = {}
if (isAdmin) {
  const results = await Promise.all(
    submission.contacts.map((c) =>
      findGuardianMatches({
        email: c.email,
        phone: c.phone,
        lastName: c.last_name,
      }).catch(() => [] as GuardianMatch[]),
    ),
  )
  submission.contacts.forEach((c, i) => {
    guardianMatchesByContact[c.id] = results[i]
  })
}
```

Pass `guardianMatchesByContact` to `RegistrationReview`.

9. `src/app/registrations/[id]/RegistrationReview.tsx`: accept the new prop. In the contacts section, under each contact, when matches exist render an amber note:
   "Matches existing guardian **{first} {last}** ({phone}{, email}) by {email|phone}. Approving with "reuse" on will link the student to that record and update its phone and address."
   Pass `hasGuardianMatches={Object.values(guardianMatchesByContact).some((m) => m.length > 0)}` to `ApproveDialog`.

10. `src/app/registrations/[id]/ApproveDialog.tsx`: add a checkbox inside the form:
    `<input type="checkbox" name="reuse_guardians" defaultChecked />` with label "Reuse matching guardian records (updates their phone and address from this submission)". When `hasGuardianMatches` is false, still render it but add the hint "No existing guardians match this submission."

**Tests.**

- `src/db/guardians.spec.ts`: `findGuardianMatches` passes args, returns `[]` on null, throws on error.
- `src/db/registrations.spec.ts` line 197 "passes rpc args through": add `p_reuse_guardians` to the expected args.
- `src/lib/schemas.spec.ts` `approveRegistrationSchema` (line 740): `reuse_guardians` absent → `false`; `'on'` → `true`.
- `src/app/registrations/actions.spec.ts`: the two approve success tests assert `reuseGuardians` is forwarded and audited.
- `src/app/registrations/[id]/RegistrationReview.spec.tsx`: renders the amber note when a contact has a match; does not when none.
- `src/app/registrations/[id]/ApproveDialog.spec.tsx`: checkbox present and checked by default; hint shown when `hasGuardianMatches` is false.
- `e2e/tests/registrations/review.e2e.ts`: add "shows a guardian match warning and reuses the guardian on approve". Use `createRegistrationSubmission` from `e2e/fixtures/seed.ts` with `contact_email` set to the seed guardian's email (see the comment at line 68 of that fixture), open the review page, assert the warning text, approve, then query `students` and assert `primary_guardian_id` equals the seed guardian id. Add a second test with the checkbox unticked asserting a new guardian row was created; clean it up in `afterEach` via the existing helpers.

**Done when.** The review page shows guardian matches for admins, the approve dialog exposes the choice, and both E2E paths pass.

---

## Task 5: Require a session in every server action outside `/register`

**Problem.** Next.js resolves a server action by its ID against the module
graph of the page the POST targets. `src/app/layout.tsx` imports
`revalidateAllCaches` from [src/app/actions.ts](../src/app/actions.ts), and the
layout is in every page's graph, so a POST to `/register` (now public) can
invoke that action without a session. It only busts caches today, but the proxy
is no longer the only gate and nothing enforces the rule.

**Steps.**

1. `src/app/actions.ts`: import `auth` from `@/auth` and add a session check as the first statement:

```ts
export async function revalidateAllCaches(): Promise<void> {
  const session = await auth()
  if (!session) return
  revalidateTag('students', 'max')
  revalidateTag('classes', 'max')
  revalidateTag('staff', 'max')
}
```

2. Create `src/app/actions.spec.ts`. Mock `@/auth` and `next/cache`. Two cases: no session → `revalidateTag` not called; session → called three times with the expected tags.

3. `src/security.spec.ts`: add a new `describe('Server actions')` block reusing `allFiles` and `stripTypeImports`. For every file whose trimmed content starts with `'use server'`, and whose path does not include `/app/register/`, assert the content contains `await auth()`. Message: `${file} is a server action outside the public /register tree and must call await auth()`. This will pass immediately once step 1 lands; it exists to catch the next public route.

4. Add the rule to `src/lib/PERMISSIONS.md` under "Other Rules":
   "Every server action must call `await auth()` itself. The proxy allowlist for `/register` means middleware cannot be relied on as the only gate. `src/security.spec.ts` enforces this."

**Done when.** The new spec passes and `revalidateAllCaches` is a no-op without a session.

---

## Task 6: Make the registration insert atomic via an RPC

**Problem.** `createRegistrationSubmission` in
[src/db/registrations.ts:39-58](../src/db/registrations.ts#L39-L58) inserts
the submission, then the contacts, and deletes the submission if the second
insert fails. If that delete also fails, an orphan with no contacts sits in the
inbox and fails approval with "no primary parent".

**Steps.**

1. Migration: add the RPC. Column lists are explicit so table defaults apply.

```sql
-- ─── create_registration_submission RPC ──────────────────────────────────────
-- Inserts a submission and its contacts in one transaction so the inbox can
-- never contain a submission without a primary contact.
CREATE OR REPLACE FUNCTION create_registration_submission(
  p_submission JSONB,
  p_contacts   JSONB
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO registration_submissions (
    child_first_name, child_last_name, date_of_birth, preferred_year_group,
    address_line_1, address_line_2, city, postcode,
    allergies, medical_details, collect_authorised, collect_password,
    consent_privacy_notice, consent_emergency_first_aid, consent_photo_media,
    consent_home_school, consent_comms_email_sms, declaration_name
  )
  SELECT
    s.child_first_name, s.child_last_name, s.date_of_birth, s.preferred_year_group,
    s.address_line_1, s.address_line_2, s.city, s.postcode,
    s.allergies, s.medical_details, s.collect_authorised, s.collect_password,
    COALESCE(s.consent_privacy_notice, FALSE), COALESCE(s.consent_emergency_first_aid, FALSE),
    COALESCE(s.consent_photo_media, FALSE), COALESCE(s.consent_home_school, FALSE),
    COALESCE(s.consent_comms_email_sms, FALSE), s.declaration_name
  FROM jsonb_populate_record(NULL::registration_submissions, p_submission) AS s
  RETURNING id INTO v_id;

  INSERT INTO registration_submission_contacts (
    submission_id, contact_role, first_name, last_name, relationship, phone, email,
    same_as_child_address, address_line_1, address_line_2, city, postcode
  )
  SELECT
    v_id, c.contact_role, c.first_name, c.last_name, c.relationship, c.phone, c.email,
    COALESCE(c.same_as_child_address, TRUE), c.address_line_1, c.address_line_2, c.city, c.postcode
  FROM jsonb_populate_recordset(NULL::registration_submission_contacts, p_contacts) AS c;

  IF NOT EXISTS (
    SELECT 1 FROM registration_submission_contacts
    WHERE submission_id = v_id AND contact_role = 'primary'
  ) THEN
    RAISE EXCEPTION 'A primary parent/carer is required';
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;
```

2. Mirror into `supabase/schema.sql`. Run `npm run gen:types`.

3. Rewrite `createRegistrationSubmission` in `src/db/registrations.ts`:

```ts
export async function createRegistrationSubmission({
  submission,
  contacts,
}: CreateRegistrationInput): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('create_registration_submission', {
    p_submission: submission as Json,
    p_contacts: contacts as Json,
  })
  if (error) throw error
  revalidateTag('registrations', 'max')
  return { id: data as string }
}
```

Import `Json` from `@/types/database` in the existing import line. Keep `CreateRegistrationInput` unchanged so `src/app/register/actions.ts` needs no edits.

**Tests.**

- `src/db/registrations.spec.ts` `describe('createRegistrationSubmission')` (line 30): replace the three existing cases with: calls the rpc with `p_submission` and `p_contacts` and returns the id; revalidates the `registrations` tag; throws the rpc error. Remove the "deletes the submission and rethrows" case since that path no longer exists.
- `src/app/register/actions.spec.ts` needs no logic change; confirm it still passes.
- `e2e/tests/registrations/public-form.e2e.ts` happy path already asserts one contact row exists; keep it.

**Done when.** No code path inserts into `registration_submissions` and `registration_submission_contacts` as two separate client calls.

---

## Task 7: Retention: purge actioned submissions from Admin Tasks

**Problem.** Submissions and opt-out requests hold child medical details,
addresses and collection passwords. Actioned rows can never be deleted
(`deleteRegistrationSubmission` and `deletePhotoOptOut` both guard with
`.neq('status', 'actioned')`) and nothing purges them once the data has been
copied into `students`.

**Design.** Keep the guard on ad-hoc delete (an actioned row is an audit trail
for a short window). Add a purge RPC and an Admin Tasks card that removes
actioned rows older than 90 days. Log the purge.

**Steps.**

1. Migration:

```sql
-- ─── purge_actioned_submissions RPC ──────────────────────────────────────────
-- Data minimisation: once a registration or opt-out has been actioned, its
-- personal data lives on the student record. Remove the staging rows after a
-- retention window. Returns the number of rows removed across both tables.
CREATE OR REPLACE FUNCTION purge_actioned_submissions(
  p_older_than_days INT DEFAULT 90
) RETURNS INT AS $$
DECLARE
  v_reg INT;
  v_opt INT;
BEGIN
  DELETE FROM registration_submissions
   WHERE status = 'actioned' AND actioned_at < NOW() - (p_older_than_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_reg = ROW_COUNT;

  DELETE FROM photo_consent_opt_outs
   WHERE status = 'actioned' AND actioned_at < NOW() - (p_older_than_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_opt = ROW_COUNT;

  RETURN v_reg + v_opt;
END;
$$ LANGUAGE plpgsql;
```

Mirror into `supabase/schema.sql`. Run `npm run gen:types`.

2. `src/db/registrations.ts`: add

```ts
export const SUBMISSION_RETENTION_DAYS = 90

export async function purgeActionedSubmissions(
  olderThanDays: number = SUBMISSION_RETENTION_DAYS,
): Promise<number> {
  const { data, error } = await supabase.rpc('purge_actioned_submissions', {
    p_older_than_days: olderThanDays,
  })
  if (error) throw error
  revalidateTag('registrations', 'max')
  revalidateTag('photo-opt-outs', 'max')
  return (data as number) ?? 0
}
```

Export from `src/db/index.ts`.

3. `src/db/audit-log.ts`: add `'submissions_purged'` to `AuditAction`.

4. Look at how `src/app/admin/page.tsx` renders its existing task cards and their server actions (read the file and its sibling `actions.ts` first; follow the same component and action shape). Add a card "Purge actioned registrations" with copy: "Removes registration submissions and photo opt-out requests that were actioned more than 90 days ago. Student records are unaffected." Wire it to a new server action `purgeActionedSubmissionsAction` in the admin actions file that:
   - calls `await auth()`, returns `{ error: 'Not authenticated' }` without a session, and `{ error: 'Not authorised' }` unless `canAccessAdminTasks(role)`;
   - calls `purgeActionedSubmissions()`;
   - logs `{ staffId, action: 'submissions_purged', entity: 'registration_submission', entityId: null, details: { removed, olderThanDays: SUBMISSION_RETENTION_DAYS } }`;
   - `revalidatePath('/registrations')` and `/dashboard`;
   - returns `{ success: true, removed }` in whatever result shape the existing admin actions use (match it exactly).

5. README: under the registration section add one line: "Actioned submissions are retained for 90 days, then removed via Admin Tasks → Purge actioned registrations."

**Tests.**

- `src/db/registrations.spec.ts`: `purgeActionedSubmissions` passes the day count, returns the rpc number, returns 0 on null, throws on error, revalidates both tags.
- Admin action spec (beside the admin actions file): not authenticated; not admin; success path calls purge, audits with the count, revalidates.
- `src/app/admin/page.spec.tsx`: the card renders for admin.
- `src/db/audit-log.spec.ts`: no change needed unless it enumerates actions; if it does, add the new one.

**Done when.** An admin can purge from Admin Tasks and the audit log records how many rows were removed.

---

## Task 8: Validate the `status` query param on the inbox page

**Problem.** [src/app/registrations/page.tsx:42-48](../src/app/registrations/page.tsx#L42-L48)
casts the raw query string to the status union. An unknown value produces a
Postgres enum error that the data layer swallows, so the page renders an empty
list with the bad tab highlighted. `submissionStatus` in `schemas.ts` already
exists and is unused.

**Steps.**

1. `src/lib/schemas.ts`, next to `submissionStatus`, add:

```ts
export const registrationStatusFilter = z
  .enum(['pending', 'actioned', 'rejected', 'all'])
  .catch('pending')
```

2. In `page.tsx` replace the destructure and the cast with:

```ts
const params = await searchParams
const status = registrationStatusFilter.parse(params.status)
```

Remove the `DEFAULT_STATUS` constant and the `as` cast. Import the schema at the top.

**Tests.**

- `src/lib/schemas.spec.ts`: `registrationStatusFilter` returns `'pending'` for `undefined`, `'nonsense'`, and `''`; passes through the four valid values.
- `src/app/registrations/page.spec.tsx`: with `status=nonsense`, `getRegistrationSubmissions` is called with `'pending'`.

**Done when.** `grep -n "as 'pending'" src/app/registrations/page.tsx` returns nothing.

---

## Task 9: Turnstile: send `remoteip`, optionally verify `hostname`

**Problem.** [src/lib/turnstile.ts](../src/lib/turnstile.ts) does not send the
client IP and ignores the `hostname` Cloudflare returns. Both are cheap
hardening against token reuse from another origin.

**Steps.**

1. Change the signature to `verifyTurnstileToken(token: string, remoteIp?: string | null): Promise<boolean>`. Include `remoteip` in the form body only when provided.

2. Parse the response as `{ success: boolean; hostname?: string }`. If `process.env.TURNSTILE_EXPECTED_HOSTNAME` is set and non-empty, return `false` unless `json.hostname === process.env.TURNSTILE_EXPECTED_HOSTNAME`. When the variable is unset, skip the check. This keeps local dev and CI (which use Cloudflare's always-pass test keys) working, and lets production pin `portal.hshb.org.uk`.

3. Add a helper `getClientIp()` in `src/lib/request-ip.ts`:

```ts
import { headers } from 'next/headers'

export async function getClientIp(): Promise<string | null> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim() || null
  return h.get('x-real-ip')
}
```

Check `node_modules/next/dist/docs/` to confirm `headers()` is async in this Next version before writing it.

4. In `src/app/register/actions.ts` and `src/app/register/photo-opt-out/actions.ts`, call `const ip = await getClientIp()` and pass it: `verifyTurnstileToken(parsed.data.turnstile_token, ip)`. Import at the top.

5. `.env.local.example`: add `TURNSTILE_EXPECTED_HOSTNAME=` under the Turnstile block with a comment "production only: portal.hshb.org.uk". README: extend the Turnstile bullet to mention it. `src/security.spec.ts` `SECRET_VARS`: not a secret, leave the list alone.

**Tests.**

- `src/lib/turnstile.spec.ts`: add: sends `remoteip` when given; omits it when not; with `TURNSTILE_EXPECTED_HOSTNAME` stubbed to `portal.hshb.org.uk`, returns `false` when hostname differs and `true` when it matches; with the variable unset, ignores hostname. Use `vi.stubEnv` as the file already does and inspect the `fetch` mock's `body` via `new URLSearchParams(String(init.body))`.
- `src/lib/request-ip.spec.ts`: mock `next/headers`; first entry of a comma-separated `x-forwarded-for`; falls back to `x-real-ip`; `null` when neither.
- Register and opt-out action specs: assert `verifyTurnstileToken` is called with the token and the mocked IP.

**Rate limiting note.** A per-IP rate limiter needs a shared store (Netlify functions have no shared memory). It is out of scope for this plan; Turnstile's single-use tokens remain the throttle. Record this in `plans/parent-registration-form.md` under future work.

**Done when.** Both public actions pass the client IP, and the hostname check is on when the env var is set.

---

## Task 10: Replace `staffId!` assertions with an explicit error

**Problem.** In [src/app/registrations/actions.ts](../src/app/registrations/actions.ts)
(lines 32, 43, 84, 92) and
[src/app/registrations/photo-opt-out-actions.ts](../src/app/registrations/photo-opt-out-actions.ts)
(lines 32, 40, 74, 82), `staffId` is computed as `?? null` then passed with `!`.
A session without a staff record silently writes a null `actioned_by`.

**Steps.**

In each of the five actions that pass `staffId!` (approve, reject, applyPhotoOptOut, rejectPhotoOptOut; delete actions only audit and can keep the nullable value), replace:

```ts
const staffId = session.user.staffId ?? null
```

with:

```ts
const staffId = session.user.staffId
if (!staffId) return { error: 'Your account is not linked to a staff record' }
```

and remove every `!` on `staffId`. The delete actions may keep `?? null` since they only pass it to the audit log.

**Tests.**

- In both action spec files, add one case per changed action: session with `staffId: undefined` returns the new error and does not call the db function.

**Done when.** `grep -n 'staffId!' src/app/registrations` returns nothing.

---

## Task 11: Clean up the new lint warning

`src/app/register/photo-opt-out/actions.ts:29` destructures
`turnstile_token: _turnstileToken` and never uses it, producing an
`@typescript-eslint/no-unused-vars` warning. Replace the destructure with an
explicit omit that does not bind a name:

```ts
const rest = { ...parsed.data, turnstile_token: undefined }
delete rest.turnstile_token
```

or, cleaner, add a small `omitTurnstileToken<T extends { turnstile_token: string }>(data: T): Omit<T, 'turnstile_token'>` helper in `src/lib/turnstile.ts` (with a spec) and use it in both public actions. `src/app/register/actions.ts` `toInsert` has the same pattern with three more `_has*` bindings; leave those unless the helper makes them trivially cleaner.

**Done when.** `npm run lint` shows no warnings in `src/app/register/`.

---

## Final verification

1. `supabase db reset` applies all migrations cleanly, including the new one.
2. `npm run gen:types` produces no diff beyond the functions added above.
3. `npm run fix:all`.
4. `npm run pipeline:check` passes: lint → format:check → type-check → test:coverage → test:e2e → build.
5. Commit each task separately with a conventional message, e.g.
   `fix(registrations): move student matching into a parameterised RPC`.
6. Push `feat/parent-registration-form` and open a PR. PR #5 on GitHub is a
   different feature (documents and records) and must not be reused for this work.
