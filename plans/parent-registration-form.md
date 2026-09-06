# Parent Registration Form — Implementation Plan (hshb-portal)

**Repo:** `hshb-portal` — Next.js 16 App Router, React 19, Tailwind 4, Supabase (Postgres), next-auth v5 (Microsoft Entra ID), Netlify.
**Goal:** A public parent/carer registration form at **`portal.hshb.org.uk/register`** whose submissions land in a **staging area** (never directly in `students`). Reviewer roles triage each submission in a **Registrations inbox**; an **admin** promotes it into `students` / `guardians` (creating a new student **or linking a returning one**) in one atomic action, assigning a class and student code on the way. Actioned submissions drop off the to-do list.

> Every claim in this plan has been checked against the repo as of the `chore/dependabot-and-dep-updates` branch. §1 records the repo facts that shaped it so nobody re-derives them. §0 records the owner's decisions, including the simplifications chosen after a complexity review.

---

## 0. Decisions (confirmed with the owner, 6 Sep 2026)

| #   | Decision               | Outcome                                                                                                                                                                                                                                                              |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Public URL**         | **`portal.hshb.org.uk/register`** (path on the existing host). No subdomain, no Netlify alias, no host-header logic.                                                                                                                                                 |
| 2   | **Layout**             | **One root layout, session-gated.** The existing layout renders the sidebar, banner and PWA registrar only when a session exists; anonymous visitors get a bare page. No route groups, no second root layout, no shared shell component (§4.1).                      |
| 3   | **Submit path**        | **Server action**, matching every other form in the repo (`FormData` → zod → `src/db` → audit → redirect). No JSON API route, no client-side zod, first-error messages only (§5.1).                                                                                  |
| 4   | **Bot defence**        | **Cloudflare Turnstile** only. No per-IP rate limit, no `source_ip` column. Turnstile's public test keys are used in E2E/CI (§10.3).                                                                                                                                 |
| 5   | **Extra field**        | **Year group / class preference** — parent picks from the year groups of active classes (plus "Not sure"). Stored on the submission only; shown to the admin as a placement hint. No `students` change.                                                              |
| 6   | **Children per form**  | **One child per submission.** Siblings are separate submissions; guardian de-dup on approval links them to the same guardian rows.                                                                                                                                   |
| 7   | **Notifications**      | **None in v1.** The dashboard shows a **Pending registrations** tile for reviewer roles. No sidebar badge. Push infra exists if wanted later.                                                                                                                        |
| 8   | **Returning children** | **Supported.** The approve dialog offers _Create new student_ or _Link to existing student_ (detected matches pre-selected, or search all students). Linking updates that student in place and reactivates them.                                                     |
| 9   | **Reviewer role**      | `admin`, `headteacher`, `secretary` **view** submissions. **No in-place corrections** — the admin fixes typos on the student and guardian edit pages after approval. Only `admin` **approves, rejects, deletes**. `teacher` sees nothing.                            |
| 10  | **Retention**          | **No automatic purge.** Admins delete rejected/stale submissions manually from the inbox. Actioned submissions are kept as the audit trail.                                                                                                                          |
| 11  | **Validation**         | Reuse the loose `ukPhone` / `optionalEmail` schemas from `src/lib/schemas.ts`. No strict UK regexes, no phone normalisation in TS (the RPC normalises digits for de-dup only).                                                                                       |
| 12  | **Address lookup**     | Deferred. Manual entry in v1. No reserved columns — a migration is cheap when it lands.                                                                                                                                                                              |
| 13  | **GP details**         | Not collected — `students` has no columns for them.                                                                                                                                                                                                                  |
| 14  | **Declaration date**   | Not asked. `submitted_at` is the declaration date; the parent types their full name only.                                                                                                                                                                            |
| 15  | **Consents storage**   | **Five boolean columns on `students`**, no separate table and no history. Approval copies the flags across; admins view them on the student details modal and change them on the student edit page. The actioned submission keeps the parent's original declaration. |

**Still open — needed before Phase D (public form) ships:**

- [ ] Cloudflare account + Turnstile **site key / secret key** for production (Netlify env vars).
- [ ] URL of the school's published **privacy notice** (the required consent checkbox links to it). Placeholder constant `PRIVACY_NOTICE_URL` in `src/lib/registration.ts` until confirmed.
- [ ] Marketing-site link: the hshb.org.uk _Enrolment_ section is Contentful MDX (`admissionsText`) — add a link to `https://portal.hshb.org.uk/register` there once live. Content change, no code.

---

## 1. Repo realities that shape the plan

| Fact (verified)                                                                                                                                                                                                      | Consequence                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/proxy.ts` (Next 16's renamed middleware) redirects **every** non-`/login` path to `/login`.                                                                                                                     | Add a `PUBLIC_PATHS` allowlist for `/register`. Server actions POST to the page URL, so the same allowlist covers the submit (§4.2).                                                            |
| `src/app/layout.tsx` is the single root layout. `AuthedSidebar` renders `PortalSidebar` **whether or not** a session exists — today the login page shows an empty-footer sidebar to logged-out staff.                | Gate the chrome on the session in that one file. Fixes the login page as a side effect. Page-level `metadata` overrides `robots` and `title` for `/register` (§4.1).                            |
| Every mutating form (`students/new`, `classes/new`, `incidents/new`, …) is a `'use client'` form calling a server action with `FormData`; the action does `auth()` → zod → `src/db` → `logAuditEvent` → `redirect`.  | The public form follows the same pattern with the `auth()` step replaced by a Turnstile check (§5.1). `extractFormFields` / prefix-based contact extraction are reused.                         |
| Auth is next-auth + Entra ID. Supabase is touched **only** server-side via the service-role client (`src/db/client.ts`, `server-only`). RLS is enabled on every table with **zero policies**.                        | New tables follow the same pattern: RLS on, no policies. Authorisation lives in `src/lib/permissions.ts` + server actions. There is no `auth.uid()`; no SECURITY DEFINER needed.                |
| RPCs are called server-side only (`migrateClass` in `src/db/classes.ts`, `getAttendanceSummaryByDate` in `src/db/attendance.ts`).                                                                                    | `approve_registration` is called from a server action via a `src/db` wrapper.                                                                                                                   |
| `src/lib/schemas.ts` already has `requiredString`, `optionalString`, `isoDate`, `ukPhone`, `optionalEmail`, `booleanFromString`, `uuid`, `ActionResult`, `extractFormFields`. Zod **v4** (`zod@4.4.3`).              | Extend that file; no parallel validation module. Add a `checkbox` helper because unticked checkboxes are absent from `FormData`.                                                                |
| `students.primary_guardian_id` is **NOT NULL** (migration `20260413000001`). `students_address_source_check` requires `address_guardian_id` **or** `address_line_1 + city + postcode`. `student_code` is **UNIQUE**. | Approval must always resolve a primary contact and write a full address. `student_code` is optional and admin-supplied — never generated.                                                       |
| `guardians.phone`, `first_name`, `last_name` are NOT NULL.                                                                                                                                                           | Every submitted contact requires first name, last name and phone (§6).                                                                                                                          |
| `classes.year_group` is free text (e.g. `Year 1`); `classes.active` flags current classes.                                                                                                                           | The year-group preference dropdown is built from the **distinct `year_group` values of active classes** at render time — no new config.                                                         |
| `audit_log.action` is free text in SQL but narrowed in TS: `AuditAction = 'create' \| 'update' \| 'delete' \| 'sign_in' \| 'sign_out'` (`src/db/audit-log.ts`). `logAuditEvent` is fire-and-forget.                  | Extend the union; never bypass `logAuditEvent`.                                                                                                                                                 |
| `src/db/*` reads are wrapped in `unstable_cache` with tags (`students`, `classes`); writes call `revalidateTag(tag, 'max')`.                                                                                         | New reads use tag `registrations`; approval also revalidates `students` and `classes`.                                                                                                          |
| `src/app/dashboard/page.tsx` already runs a `Promise.all` of counts and renders role-dependent stat tiles.                                                                                                           | The pending-registrations tile is a few lines there; no layout or sidebar plumbing.                                                                                                             |
| `src/security.spec.ts` walks `src/` and fails if a `'use client'` file imports `@/db` or `@/auth`, or mentions a name in `SECRET_VARS`.                                                                              | `RegistrationForm.tsx` and `TurnstileWidget.tsx` must not import `@/db`/`@/auth` (importing `./actions` is fine — `AddStudentForm` does the same). Add `TURNSTILE_SECRET_KEY` to `SECRET_VARS`. |
| `src/types/database.ts` is **auto-generated** (`npx supabase gen types typescript --project-id "zfznuscqncvujhzjzinc" --schema public > src/types/database.ts`).                                                     | Regenerate after the migration is applied to the hosted project. Never hand-edit.                                                                                                               |
| `supabase/schema.sql` is documented as the **authoritative schema** and mirrors the initial migration.                                                                                                               | The new DDL is appended to **both** the migration and `schema.sql`.                                                                                                                             |
| Playwright projects are all role-authenticated (`storageState` per role, 4 roles × 2 viewports). `login.e2e.ts` runs unauthenticated via `test.use({ storageState: { cookies: [], origins: [] } })`.                 | Public-form E2E follows the `login.e2e.ts` pattern — **no new Playwright project**. Admin-review E2E pins `storageState` to admin like `add-student.e2e.ts`.                                    |
| `e2e/global-setup.ts` runs `supabase db reset` once per suite; each spec file runs under all 8 projects in parallel.                                                                                                 | E2E tests create their own submissions with project-unique names rather than mutating seeded rows.                                                                                              |
| `.github/workflows/ci.yml` builds with placeholder env; `e2e.yml` starts local Supabase and runs the suite.                                                                                                          | Both workflows need the Turnstile **test** keys added (§10.3). The page tolerates a missing site key.                                                                                           |
| `netlify.toml` sets `X-Frame-Options: DENY`, HSTS, no CSP. Next's default server-action body limit is 1 MB.                                                                                                          | Turnstile's iframe is embedded by us (allowed). No CSP to update, no manual body cap. Nothing to change.                                                                                        |
| `@headlessui/react` and `Tooltip.tsx` exist.                                                                                                                                                                         | Use Headless UI `Dialog` for approve/reject.                                                                                                                                                    |

---

## 2. Architecture

```text
Parent (anonymous)  portal.hshb.org.uk/register        ← bare layout (no session → no chrome)
        │  <form> → submitRegistrationAction(FormData)   (server action, POST /register)
        ▼
src/app/register/actions.ts
        │  Turnstile verify → zod → service-role insert → audit → redirect /register/success
        ▼
registration_submissions + registration_submission_contacts      (status = 'pending')
        │
        ▼
portal.hshb.org.uk/dashboard                           ← "Pending registrations" tile (reviewer roles)
portal.hshb.org.uk/registrations                       ← auth-gated, reviewer roles, read-only
   • list       → tabs: To-do / Actioned / Rejected / All
   • [id]       → review, see possible existing-student matches, then (admin):
        ├── Reject  → server action → status='rejected' + reason
        ├── Delete  → server action → hard delete (rejected/pending only)
        └── Approve → server action → rpc('approve_registration')
                 guardians (de-dup) → student (INSERT or UPDATE existing)
                 (consent flags copied onto the student) → student_classes → status='actioned', student_id set
                 → redirect to /students/[id]/edit so the admin fills in anything else
```

**Two hard rules:**

- The browser **never** talks to Supabase. The public submit runs server-side with the service-role client like every other write.
- HTML `required` / `type="email"` / `type="date"` attributes are UX only. The server action re-runs the full zod schema on every submit.

---

## 3. Data model

### 3.1 New tables and columns (migration `supabase/migrations/2026MMDDHHMMSS_add_registration_submissions.sql`)

Adds five consent columns to `students`; nothing else in `students` / `guardians` changes. Append the same DDL (including the `ALTER TABLE students`) to the end of `supabase/schema.sql`.

```sql
-- ─── Registration submissions (public form staging area) ─────────────────────

CREATE TYPE submission_status AS ENUM ('pending', 'actioned', 'rejected');
CREATE TYPE contact_role      AS ENUM ('primary', 'secondary', 'additional_1', 'additional_2');

CREATE TABLE registration_submissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status                submission_status NOT NULL DEFAULT 'pending',
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Child
  child_first_name      TEXT NOT NULL,
  child_last_name       TEXT NOT NULL,
  date_of_birth         DATE NOT NULL,
  preferred_year_group  TEXT,                       -- parent's placement hint; not copied to students

  -- Home address (NOT NULL here, so students_address_source_check is always satisfiable on approval)
  address_line_1        TEXT NOT NULL,
  address_line_2        TEXT,
  city                  TEXT NOT NULL,
  postcode              TEXT NOT NULL,

  -- Medical
  allergies             TEXT,
  medical_details       TEXT,

  -- Collection arrangements (submission-only; surfaced to the admin, who can copy into students.notes)
  collect_authorised    TEXT,
  collect_password      TEXT,

  -- Consents (parent's declaration)
  consent_privacy_notice      BOOLEAN NOT NULL DEFAULT FALSE,
  consent_emergency_first_aid BOOLEAN NOT NULL DEFAULT FALSE,
  consent_photo_media         BOOLEAN NOT NULL DEFAULT FALSE,
  consent_home_school         BOOLEAN NOT NULL DEFAULT FALSE,
  consent_comms_email_sms     BOOLEAN NOT NULL DEFAULT FALSE,
  declaration_name            TEXT NOT NULL,

  -- Workflow (approve and reject both set actioned_*)
  actioned_by           UUID REFERENCES staff(id) ON DELETE SET NULL,
  actioned_at           TIMESTAMPTZ,
  student_id            UUID REFERENCES students(id) ON DELETE SET NULL,   -- created OR linked
  linked_existing       BOOLEAN NOT NULL DEFAULT FALSE,
  rejected_reason       TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER registration_submissions_updated_at
  BEFORE UPDATE ON registration_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX ON registration_submissions (status);
CREATE INDEX ON registration_submissions (submitted_at DESC);
CREATE INDEX ON registration_submissions (student_id);

CREATE TABLE registration_submission_contacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id         UUID NOT NULL REFERENCES registration_submissions(id) ON DELETE CASCADE,
  contact_role          contact_role NOT NULL,
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  relationship          TEXT,
  phone                 TEXT NOT NULL,
  email                 TEXT,
  same_as_child_address BOOLEAN NOT NULL DEFAULT TRUE,
  address_line_1        TEXT,
  address_line_2        TEXT,
  city                  TEXT,
  postcode              TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, contact_role)
);

CREATE INDEX ON registration_submission_contacts (submission_id);

-- ─── Consent flags on students (current state only; no history) ──────────────

ALTER TABLE students
  ADD COLUMN consent_privacy_notice      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN consent_emergency_first_aid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN consent_photo_media         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN consent_home_school         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN consent_comms_email_sms     BOOLEAN NOT NULL DEFAULT FALSE;
-- Existing students default to FALSE; the office sets them on the edit page as paper forms are checked.

ALTER TABLE registration_submissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_submission_contacts ENABLE ROW LEVEL SECURITY;
-- No policies: same deny-all-except-service-role model as every other table.
```

### 3.2 `approve_registration` RPC

A Postgres function so guardians, the student (with its consent flags) and the class enrolment land atomically or not at all. Modelled on `migrate_class`. Plain `LANGUAGE plpgsql` — no `SECURITY DEFINER`, no in-function role check; the calling server action has already verified the session role and passes `p_staff_id` for attribution.

```sql
CREATE OR REPLACE FUNCTION approve_registration(
  p_submission_id       UUID,
  p_staff_id            UUID,
  p_student_code        TEXT DEFAULT NULL,
  p_class_id            UUID DEFAULT NULL,
  p_existing_student_id UUID DEFAULT NULL     -- NULL = create; set = link/update returning child
) RETURNS UUID AS $$
DECLARE
  v_sub        registration_submissions%ROWTYPE;
  v_con        registration_submission_contacts%ROWTYPE;
  v_student_id UUID;
  v_gid        UUID;
  v_primary UUID; v_secondary UUID; v_add1 UUID; v_add2 UUID;
  v_rel_primary TEXT; v_rel_secondary TEXT; v_rel_add1 TEXT; v_rel_add2 TEXT;
BEGIN
  SELECT * INTO v_sub FROM registration_submissions
    WHERE id = p_submission_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found or already actioned';
  END IF;

  -- Resolve each contact to a guardian row. De-dup: case-insensitive email match,
  -- else digits-only phone + case-insensitive last name. Otherwise insert.
  FOR v_con IN
    SELECT * FROM registration_submission_contacts WHERE submission_id = p_submission_id
  LOOP
    v_gid := NULL;
    IF v_con.email IS NOT NULL THEN
      SELECT id INTO v_gid FROM guardians WHERE LOWER(email) = LOWER(v_con.email) LIMIT 1;
    END IF;
    IF v_gid IS NULL THEN
      SELECT id INTO v_gid FROM guardians
       WHERE regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_con.phone, '\D', '', 'g')
         AND LOWER(last_name) = LOWER(v_con.last_name)
       LIMIT 1;
    END IF;
    IF v_gid IS NULL THEN
      INSERT INTO guardians (first_name, last_name, phone, email,
                             address_line_1, address_line_2, city, postcode)
      VALUES (v_con.first_name, v_con.last_name, v_con.phone, v_con.email,
        CASE WHEN v_con.same_as_child_address THEN v_sub.address_line_1 ELSE v_con.address_line_1 END,
        CASE WHEN v_con.same_as_child_address THEN v_sub.address_line_2 ELSE v_con.address_line_2 END,
        CASE WHEN v_con.same_as_child_address THEN v_sub.city           ELSE v_con.city           END,
        CASE WHEN v_con.same_as_child_address THEN v_sub.postcode       ELSE v_con.postcode       END)
      RETURNING id INTO v_gid;
    END IF;

    CASE v_con.contact_role
      WHEN 'primary'      THEN v_primary   := v_gid; v_rel_primary   := v_con.relationship;
      WHEN 'secondary'    THEN v_secondary := v_gid; v_rel_secondary := v_con.relationship;
      WHEN 'additional_1' THEN v_add1      := v_gid; v_rel_add1      := v_con.relationship;
      WHEN 'additional_2' THEN v_add2      := v_gid; v_rel_add2      := v_con.relationship;
    END CASE;
  END LOOP;

  IF v_primary IS NULL THEN
    RAISE EXCEPTION 'Submission has no primary parent/carer — cannot create a student';
  END IF;

  IF p_existing_student_id IS NULL THEN
    INSERT INTO students (
      student_code, first_name, last_name, date_of_birth,
      address_line_1, address_line_2, city, postcode, address_guardian_id,
      allergies, medical_details,
      consent_privacy_notice, consent_emergency_first_aid, consent_photo_media,
      consent_home_school, consent_comms_email_sms,
      primary_guardian_id, primary_guardian_relationship,
      secondary_guardian_id, secondary_guardian_relationship,
      additional_contact_1_id, additional_contact_1_relationship,
      additional_contact_2_id, additional_contact_2_relationship)
    VALUES (
      p_student_code, v_sub.child_first_name, v_sub.child_last_name, v_sub.date_of_birth,
      v_sub.address_line_1, v_sub.address_line_2, v_sub.city, v_sub.postcode, NULL,
      v_sub.allergies, v_sub.medical_details,
      v_sub.consent_privacy_notice, v_sub.consent_emergency_first_aid, v_sub.consent_photo_media,
      v_sub.consent_home_school, v_sub.consent_comms_email_sms,
      v_primary, v_rel_primary, v_secondary, v_rel_secondary,
      v_add1, v_rel_add1, v_add2, v_rel_add2)
    RETURNING id INTO v_student_id;
  ELSE
    -- Returning child: the submission is the source of truth for names, DOB,
    -- address, medical info, consents and contacts. Reactivate the student.
    UPDATE students SET
      student_code  = COALESCE(p_student_code, student_code),
      first_name    = v_sub.child_first_name,
      last_name     = v_sub.child_last_name,
      date_of_birth = v_sub.date_of_birth,
      address_line_1 = v_sub.address_line_1, address_line_2 = v_sub.address_line_2,
      city = v_sub.city, postcode = v_sub.postcode, address_guardian_id = NULL,
      allergies = v_sub.allergies, medical_details = v_sub.medical_details,
      consent_privacy_notice = v_sub.consent_privacy_notice,
      consent_emergency_first_aid = v_sub.consent_emergency_first_aid,
      consent_photo_media = v_sub.consent_photo_media,
      consent_home_school = v_sub.consent_home_school,
      consent_comms_email_sms = v_sub.consent_comms_email_sms,
      primary_guardian_id = v_primary,     primary_guardian_relationship = v_rel_primary,
      secondary_guardian_id = v_secondary, secondary_guardian_relationship = v_rel_secondary,
      additional_contact_1_id = v_add1,    additional_contact_1_relationship = v_rel_add1,
      additional_contact_2_id = v_add2,    additional_contact_2_relationship = v_rel_add2,
      active = TRUE
    WHERE id = p_existing_student_id
    RETURNING id INTO v_student_id;
    IF v_student_id IS NULL THEN
      RAISE EXCEPTION 'Existing student not found';
    END IF;
  END IF;

  IF p_class_id IS NOT NULL THEN
    INSERT INTO student_classes (student_id, class_id)
    VALUES (v_student_id, p_class_id)
    ON CONFLICT (student_id, class_id) DO NOTHING;
  END IF;

  UPDATE registration_submissions SET
    status          = 'actioned',
    actioned_by     = p_staff_id,
    actioned_at     = NOW(),
    student_id      = v_student_id,
    linked_existing = (p_existing_student_id IS NOT NULL)
  WHERE id = p_submission_id;

  RETURN v_student_id;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Student code "%" is already in use', p_student_code;
  WHEN check_violation THEN
    RAISE EXCEPTION 'Student address is incomplete — cannot approve';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Invalid class or student reference — a record may have been deleted';
END;
$$ LANGUAGE plpgsql;
```

Notes:

- Reject and delete are plain `UPDATE`/`DELETE` statements in `src/db/registrations.ts`; no function needed.
- Guardian de-dup is conservative and **silent**. When linking a returning child, the student's guardian FKs are overwritten with the resolved ids; previous guardian rows are left in place (they are reusable records). If the office reports surprise merges, surface candidate matches per contact in the review UI with an explicit link/create choice — flagged as a follow-up, not v1.
- Because there are no reviewer corrections, a typo in a submitted email or phone can create a duplicate guardian. The admin fixes that on `/guardians/[id]/edit`, which already exists.
- Audit logging stays in the server action via `logAuditEvent`, not inside the RPC.

### 3.3 Seed data (`supabase/seed.sql`)

Add a deterministic pending submission (with a primary contact) and a rejected one so manual testing has rows on first `supabase db reset`:

```text
80000000-0000-0000-0000-000000000001  pending   child "Seed Pending", primary contact "Petra Pending"
80000000-0000-0000-0000-000000000002  rejected  child "Seed Rejected", rejected_reason "Duplicate"
81000000-0000-0000-0000-00000000000N  contacts
```

Mirror the ids in `e2e/fixtures/seed.ts` under `SEED_IDS.registrations`. E2E tests that mutate state create their **own** rows (§10.2) and only read these.

### 3.4 Types

After applying the migration to the hosted project:

```text
npx supabase gen types typescript --project-id "zfznuscqncvujhzjzinc" --schema public > src/types/database.ts
```

This adds the consent columns to `Tables<'students'>`, plus `Tables<'registration_submissions'>`, `Tables<'registration_submission_contacts'>`, `Enums<'submission_status'>`, `Enums<'contact_role'>` and `Functions['approve_registration']`.

---

## 4. Public route + layout

### 4.1 Session-gated root layout (`src/app/layout.tsx`)

No route groups. The existing root layout becomes `async`, resolves the session once, and renders the chrome only when one exists:

```tsx
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  return (
    <html
      lang="en"
      className={clsx('h-full scroll-smooth antialiased', inter.variable)}
    >
      <head>
        <IosSplashLinks />
      </head>
      <body className="flex min-h-full flex-col bg-white text-slate-900">
        {session ? (
          <div className="flex min-h-screen bg-gray-100 print:min-h-0">
            <PwaRegistrar />
            <Suspense fallback={<SidebarLoadingSkeleton />}>
              <AuthedSidebar />
            </Suspense>
            <main className="flex-1 overflow-auto px-4 py-6 pt-20 md:p-8">
              <Suspense fallback={null}>
                <AuthedNotificationBanner />
              </Suspense>
              {children}
            </main>
          </div>
        ) : (
          children
        )}
        {process.env.NODE_ENV === 'production' && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID!} />
        )}
      </body>
    </html>
  )
}
```

Effects:

- Anonymous visitors to `/register` and `/login` get a bare page. The login page already styles itself full-screen, so it looks the same minus the stray sidebar it shows today.
- Staff who preview `/register` while logged in see the sidebar. Acceptable.
- `PwaRegistrar` no longer registers the service worker for parents. The manifest link and iOS splash tags still ship; they are inert `<link>` tags.
- `src/app/register/page.tsx` exports `metadata: { title: { absolute: 'Register | Hellenic School of High Barnet' }, robots: { index: true, follow: true } }`, which Next merges over the layout's `noindex` and title template.
- Add `src/app/layout.spec.tsx` covering both branches (mock `@/auth`).

### 4.2 `src/proxy.ts`

```ts
const PUBLIC_PATHS = ['/register']

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const isPublicPath = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
  if (isPublicPath) return // form, its success page, and the server-action POST to /register

  // ...existing login / reports logic unchanged
})
```

`/registrations` (the inbox) does **not** match `/register` + `/`, so it stays gated.

Extend `src/proxy.spec.ts`: unauthenticated `/register` → no redirect; unauthenticated `/register/success` → no redirect; authenticated `/register` → no redirect; unauthenticated `/registrations` → `/login` (proves the prefix check is exact); existing cases still pass.

### 4.3 Netlify / DNS

Nothing. Same site, same host, same headers. `X-Frame-Options: DENY` is about our page being framed and does not affect the Turnstile iframe we embed.

---

## 5. Backend

### 5.1 `submitRegistrationAction` (`src/app/register/actions.ts`)

The only unauthenticated write in the app. Same shape as `createStudentAction` in `src/app/students/new/actions.ts`, with the `auth()` step replaced by Turnstile:

```ts
'use server'
export async function submitRegistrationAction(
  formData: FormData,
): Promise<ActionResult> {
  if (!process.env.TURNSTILE_SECRET_KEY)
    return {
      error: 'Registration is temporarily unavailable. Please try again later.',
    }

  const parsed = registrationSubmissionSchema.safeParse(
    extractFormFields(formData),
  )
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const contacts = [] // primary always; others gated by has_* flags
  for (const [prefix, role, present] of [
    ['primary', 'primary', true],
    ['secondary', 'secondary', parsed.data.has_secondary],
    ['contact1', 'additional_1', parsed.data.has_contact1],
    ['contact2', 'additional_2', parsed.data.has_contact2],
  ] as const) {
    if (!present) continue
    const c = registrationContactSchema.safeParse(
      extractRegistrationContact(formData, prefix),
    )
    if (!c.success) return { error: c.error.issues[0].message }
    contacts.push({ contact_role: role, ...c.data })
  }

  if (!(await verifyTurnstileToken(parsed.data.turnstile_token)))
    return { error: 'Verification failed. Please try again.' }

  try {
    const { id } = await createRegistrationSubmission({
      submission: toInsert(parsed.data),
      contacts,
    })
    logAuditEvent({
      staffId: null,
      action: 'registration_submitted',
      entity: 'registration_submission',
      entityId: id,
    })
  } catch (err) {
    console.error('[submitRegistrationAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to submit registration. Please try again.',
      ),
    }
  }

  redirect('/register/success')
}
```

`toInsert` is a non-exported helper in the same file that drops `has_*` and `turnstile_token` and returns the `registration_submissions` insert shape; it is covered through the action's spec. **`actions.ts` must export nothing but `submitRegistrationAction`** — every export from a `'use server'` file is a public endpoint.

Validation runs before the Turnstile round-trip so malformed submits cost nothing. Nothing submitted is ever returned to the browser. Next's default 1 MB server-action body limit is the size cap. `actions.spec.ts` mocks `@/db`, `@/lib/turnstile` and `next/navigation` in the style of `students/new/actions.spec.ts`.

### 5.2 `src/db/registrations.ts` (+ `registrations.spec.ts`, exported from `src/db/index.ts`)

```ts
export type RegistrationStatus = Enums<'submission_status'>
export type ContactRole = Enums<'contact_role'>
export type RegistrationSummary = { id, status, submitted_at, child_first_name, child_last_name, date_of_birth, preferred_year_group, primary_contact: { first_name, last_name, phone, email } | null }
export type RegistrationFull = Tables<'registration_submissions'> & { contacts: Tables<'registration_submission_contacts'>[] }

createRegistrationSubmission({ submission, contacts }): Promise<{ id: string }>
  // insert submission (select id) → insert contacts; if the contacts insert fails,
  // delete the submission and rethrow (PostgREST has no multi-statement transaction).
  // revalidateTag('registrations')
getRegistrationSubmissions(status: RegistrationStatus | 'all')    // unstable_cache, tag 'registrations'
  // select: '…, primary_contact:registration_submission_contacts(first_name, last_name, phone, email)'
  // with .eq('registration_submission_contacts.contact_role', 'primary'); order submitted_at desc
getPendingRegistrationCount(): Promise<number>                      // unstable_cache, tag 'registrations'
getRegistrationSubmissionById(id): Promise<RegistrationFull | null> // unstable_cache, tag 'registrations'
approveRegistration({ submissionId, staffId, studentCode, classId, existingStudentId }): Promise<string>
  // supabase.rpc('approve_registration', …) like migrateClass; revalidateTag registrations, students, classes
rejectRegistration({ submissionId, staffId, reason })
  // update status/reason/actioned_by/actioned_at … .eq('status','pending').select('id');
  // throw 'already actioned' if no row returned
deleteRegistrationSubmission(id)
  // delete … .neq('status','actioned').select('id'); throw if no row (actioned rows are the audit trail)
```

`src/db/students.ts` gains two exports (specs in `students.spec.ts`):

```ts
findStudentMatches({ firstName, lastName, dateOfBirth }): Promise<StudentMatch[]>
  // includes inactive; LOWER(last_name) match AND (date_of_birth = dob OR LOWER(first_name) match); limit 10
getStudentsForLinking(): Promise<StudentMatch[]>
  // id, first_name, last_name, date_of_birth, student_code, active — all students, for the client-side picker
```

### 5.3 `src/lib/turnstile.ts` (+ `turnstile.spec.ts`)

```ts
export async function verifyTurnstileToken(token: string): Promise<boolean>
```

POSTs `secret` and `response` to `https://challenges.cloudflare.com/turnstile/v0/siteverify`, returns `json.success === true`, and returns `false` on any network error or non-2xx. Spec mocks `global.fetch` with `vi.fn()`.

### 5.4 Address lookup — deferred

When it lands: `src/app/api/address-lookup/route.ts` proxying Ideal Postcodes server-side, returning `line_1, line_2, post_town, postcode, uprn`, plus a migration for `address_uprn`. Do not use getAddress.io (discontinued Feb 2026).

---

## 6. Validation (`src/lib/schemas.ts` + `schemas.spec.ts`)

Extend the existing file. The schema is **flat**, keyed by form field names, because it parses `extractFormFields(formData)` like every other form. Zod 4 syntax.

```ts
// Unticked checkboxes are absent from FormData; ticked ones send "on".
export const checkbox = z
  .string()
  .optional()
  .transform((v) => v === 'on' || v === 'true')
export const requiredCheckbox = (message: string) =>
  checkbox.refine((v) => v, message)

export const submissionStatus = z.enum(['pending', 'actioned', 'rejected'])

export const registrationContactSchema = z.object({
  first_name: requiredString,
  last_name: requiredString,
  relationship: optionalString,
  phone: ukPhone, // guardians.phone is NOT NULL
  email: optionalEmail,
  same_as_child_address: checkbox,
  address_line_1: optionalString,
  address_line_2: optionalString,
  city: optionalString,
  postcode: optionalString,
})

export const registrationSubmissionSchema = z.object({
  child_first_name: requiredString,
  child_last_name: requiredString,
  date_of_birth: isoDate,
  preferred_year_group: optionalString,
  address_line_1: requiredString, // NOT NULL in the table; makes students_address_source_check satisfiable
  address_line_2: optionalString,
  city: requiredString,
  postcode: requiredString,
  allergies: optionalString,
  medical_details: optionalString,
  collect_authorised: optionalString,
  collect_password: optionalString,
  has_secondary: booleanFromString,
  has_contact1: booleanFromString,
  has_contact2: booleanFromString,
  consent_privacy_notice: requiredCheckbox(
    'You must accept the privacy notice',
  ),
  consent_emergency_first_aid: requiredCheckbox(
    'Emergency first aid consent is required',
  ),
  consent_photo_media: checkbox,
  consent_home_school: checkbox,
  consent_comms_email_sms: checkbox,
  declaration_name: requiredString,
  turnstile_token: requiredString,
})

export const approveRegistrationSchema = z.object({
  student_code: optionalString,
  class_id: optionalString.pipe(uuid.nullable()),
  existing_student_id: optionalString.pipe(uuid.nullable()),
})

export const rejectRegistrationSchema = z.object({ reason: requiredString })

// Mirrors extractGuardianFields: reads `${prefix}_first_name` … `${prefix}_postcode`
export function extractRegistrationContact(
  formData: FormData,
  prefix: string,
): Record<string, unknown>
```

Spec cases: each required field missing; optional-contact email empty accepted / malformed rejected; either required consent absent rejected; `checkbox` handles `undefined`/`'on'`/`'true'`; `approveRegistrationSchema` with empty strings → nulls; `extractRegistrationContact` prefix mapping.

`src/lib/registration.ts` (+ spec): `PRIVACY_NOTICE_URL`, `YEAR_GROUP_NOT_SURE = 'Not sure'`, and `distinctYearGroups(classes): string[]`. No `@/db`/`@/auth` imports.

---

## 7. Permissions and audit

`src/lib/permissions.ts` (+ `permissions.spec.ts`, + rows in `src/lib/PERMISSIONS.md`):

```ts
export function canReviewRegistrations(role: StaffRole): boolean {
  return role === 'admin' || role === 'headteacher' || role === 'secretary'
}
export function canApproveRegistrations(role: StaffRole): boolean {
  return role === 'admin' // creates/updates a student — same bar as canCreateStudents
}
```

`src/db/audit-log.ts` — extend the union (the `audit_log.action` column is free text, no migration):

```ts
type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'sign_in'
  | 'sign_out'
  | 'registration_submitted'
  | 'registration_approved'
  | 'registration_rejected'
  | 'registration_deleted'
```

---

## 8. Admin inbox and review (`src/app/registrations/`)

```text
registrations/
  page.tsx                 ← list; redirect('/dashboard') unless canReviewRegistrations
  page.spec.tsx
  loading.tsx              ← table skeleton like students/loading.tsx
  loading.spec.tsx
  actions.ts               ← approve / reject / delete (§8.3)
  actions.spec.ts
  RegistrationTabs.tsx     ← Link-based tabs like admin/_components/AdminTabBar.tsx
  RegistrationTabs.spec.tsx
  RegistrationsTable.tsx   ← 'use client'; name search like StudentsTable.tsx; rows link to [id]
  RegistrationsTable.spec.tsx
  [id]/
    page.tsx               ← fetches submission, matches, classes, students-for-linking (admin only)
    page.spec.tsx
    loading.tsx / loading.spec.tsx
    RegistrationReview.tsx ← 'use client'; read-only sections, workflow panel, action buttons
    RegistrationReview.spec.tsx
    ApproveDialog.tsx      ← 'use client'; Headless UI Dialog
    ApproveDialog.spec.tsx
    RejectDialog.tsx / RejectDialog.spec.tsx
```

### 8.1 Dashboard tile and nav item

- `src/app/dashboard/page.tsx`: add `canReviewRegistrations(role) ? getPendingRegistrationCount() : Promise.resolve(null)` to the existing `Promise.all`, and a **Pending registrations** tile (linking to `/registrations`) rendered when the count is not null. Extend `dashboard/page.spec.tsx`.
- Portal layout `navItems`: add `{ href: '/registrations', label: 'Registrations', Icon: InboxIcon, filter: canReviewRegistrations }`; `PortalSidebar.iconMap` gains `/registrations`. No badge, no new props.

### 8.2 List — `/registrations`

- `?status=pending|actioned|rejected|all`, default `pending`. Tabs labelled **To-do / Actioned / Rejected / All**.
- Columns: Child, DOB, Year group pref., Primary contact (name + phone), Submitted, Status badge. Sorted `submitted_at DESC`. Client-side name search.
- Empty state via `EmptyState`.

### 8.3 Review — `/registrations/[id]`

Read-only for every reviewer role. Sections: Child · Home address · Medical · Contacts (one card per role) · Collection arrangements · Consents (with signed-by name and submitted date) · Workflow (submitted, actioned by/at, link to student, rejected reason).

- **Possible existing students** panel: results of `findStudentMatches` (name, DOB, code, active/inactive). Empty state: "No existing students match."
- **Approve & save student** (admin): `ApproveDialog` with
  - mode radio: _Create new student_ (default) / _Link to existing student_ (pre-selected to the first match if any; otherwise a search box over `getStudentsForLinking()` using the same 5-character client-side filter as `AddStudentForm`'s guardian picker),
  - optional `student_code` (shows the existing code when linking),
  - optional class `<select>` from `getAllClasses()`,
  - warning copy when linking: "This overwrites the student's name, DOB, address, medical info and contacts with this submission."
  - The dialog is a `<form>` posting `student_code`, `class_id` and `existing_student_id` to `approveRegistrationAction`; in _Create_ mode `existing_student_id` is submitted empty, so the schema in §6 needs no `mode` field.
- **Reject** (admin): `RejectDialog`, reason required.
- **Delete** (admin, rejected or pending only): confirm, then hard delete.
- Headteacher/secretary see Approve/Reject/Delete **disabled with a `Tooltip`** ("Only admins can approve registrations"), matching the Students page pattern.
- A note under the contacts section: "Spotted a typo? Approve, then correct it on the student or guardian edit page."

### 8.4 Server actions — `actions.ts`

Follow `src/app/students/new/actions.ts` exactly: `await auth()` → role check → zod parse → `src/db` call → `logAuditEvent` → `revalidatePath` → `redirect`, returning `ActionResult` on failure. Every action re-checks the role; the UI guard is not the security boundary.

| Action                                    | Guard                     | On success                                                                                                                                                |
| ----------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approveRegistrationAction(id, formData)` | `canApproveRegistrations` | audit `registration_approved` with `{ studentId, linkedExisting, classId }`; `redirect('/students/[studentId]/edit')` so the admin fills in anything else |
| `rejectRegistrationAction(id, formData)`  | `canApproveRegistrations` | audit `registration_rejected`; `redirect('/registrations?status=rejected')`                                                                               |
| `deleteRegistrationAction(id)`            | `canApproveRegistrations` | audit `registration_deleted` with the child's name (the row is gone); `redirect('/registrations?status=rejected')`                                        |

All three call `revalidatePath('/registrations')` and `revalidatePath('/dashboard')`; approve also revalidates `/students`.

Errors from the RPC (`RAISE EXCEPTION` messages) are surfaced verbatim via `getUserFriendlyDbError`'s fallback path, as `ClassMigrationForm` does today.

### 8.5 Consents on the existing student pages

The five flags live on `students`, so they are displayed and edited exactly like `allergies` and `medical_details`:

- **`src/components/StudentDetailsModal.tsx`** — add a **Consents** section (Privacy notice · Emergency first aid · Photo & media · Home–school agreement · Email & SMS) rendered as Yes/No, shown to roles that pass `canSeeStudentMedical`. Add the five fields to `StudentForModal`; `STUDENT_SELECT` uses `*` so no query change.
- **`src/app/students/[id]/edit/EditStudentForm.tsx`** — add a **Consents** section of five checkboxes (`consent_*`, `defaultChecked` from the student). Add the fields to `StudentData`.
- **`src/lib/schemas.ts`** — `updateStudentSchema` gains the five `consent_*` fields using the `checkbox` helper (§6). `createStudentSchema` is unchanged; students added by staff start with all flags `false`.
- **`src/app/students/[id]/edit/actions.ts`** — pass the five parsed booleans to `updateStudent`. `StudentInsert` / `StudentUpdate` in `src/db/students.ts` gain the optional fields.
- A short note beside the checkboxes: "Tick only what the parent has signed for." No history is kept; the actioned registration submission still records the parent's original declaration.

---

## 9. Public form (`src/app/register/`)

```text
register/
  page.tsx                 ← server component: year groups from getAllClasses(), renders form; own metadata
  page.spec.tsx
  actions.ts               ← submitRegistrationAction (§5.1)
  actions.spec.ts
  RegistrationForm.tsx     ← 'use client'
  RegistrationForm.spec.tsx
  success/page.tsx         ← static "thank you" page (refresh-safe, GA goal target)
  success/page.spec.tsx
src/clientComponents/
  TurnstileWidget.tsx / TurnstileWidget.spec.tsx
src/types/turnstile.d.ts
```

### 9.1 Page

Server component. Loads `getAllClasses()` and derives sorted distinct `year_group` values via `distinctYearGroups`; passes them plus `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null` to the form. Header: logo, "Hellenic School of High Barnet", "Student registration", short intro, required-field note. If the site key is missing the page renders a "Registration is temporarily unavailable" notice instead of the form (keeps CI builds and misconfigured deploys safe).

### 9.2 `RegistrationForm.tsx` (`'use client'`)

Single page, eight sections, Tailwind + `@tailwindcss/forms`, markup and `Field`/`FormSection` helpers copied from `AddStudentForm.tsx`. Submit handling is identical to `AddStudentForm`: `startTransition(async () => { const result = await submitRegistrationAction(new FormData(form)); if (result?.error) setError(result.error) })`. On success the action redirects, so the client never sees the data again.

1. **Child's details** — `child_first_name`\*, `child_last_name`\*, `date_of_birth`\* (`type="date"`), `preferred_year_group` select (active class year groups + "Not sure").
2. **Home address** — `address_line_1`\*, `address_line_2`, `city`\*, `postcode`\*.
3. **Medical & dietary** — `allergies`, `medical_details` (textareas).
4. **Parent/carer 1 (required)** — `primary_first_name`\*, `primary_last_name`\*, `primary_relationship`, `primary_phone`\*, `primary_email`, `primary_same_as_child_address` (checked by default; unticking reveals `primary_address_*`).
5. **Parent/carer 2 (optional, revealed)** — `secondary_*`, hidden `has_secondary`.
6. **Emergency contacts 1 & 2 (optional, revealed)** — `contact1_*` / `contact2_*`, hidden `has_contact1` / `has_contact2`; plus **collection arrangements** (`collect_authorised`, `collect_password`).
7. **Consents** — required: `consent_privacy_notice` (label links `PRIVACY_NOTICE_URL`) and `consent_emergency_first_aid`. Optional: `consent_photo_media` (wording names social media, website and promotional material), `consent_home_school`, `consent_comms_email_sms`.
8. **Declaration** — `declaration_name`\*, `TurnstileWidget` writing a hidden `turnstile_token` input, submit (disabled until a token exists and while pending).

Client-side validation is HTML attributes only (`required`, `type="email"`, `type="tel"`, `type="date"`), as the staff forms do. Server errors show in the same red line under the submit button.

### 9.3 `src/clientComponents/TurnstileWidget.tsx`

Loads `https://challenges.cloudflare.com/turnstile/v0/api.js` via `next/script` (`strategy="afterInteractive"`), renders explicitly into a `ref` with `window.turnstile.render(el, { sitekey, callback, 'expired-callback', 'error-callback' })`, and reports the token up through `onToken(token | null)`. Props: `siteKey`, `onToken`. No npm dependency. Spec stubs `window.turnstile` and asserts render/callback wiring.

### 9.4 `success/page.tsx`

Static: "Thank you — we've received your registration. The school office will be in touch." plus a link back to hshb.org.uk. No data.

---

## 10. Tests

Global rules apply: every new function/component has a spec beside it; `vi.mock`/`vi.fn` only; React Testing Library for components; explicit return types; no `any` outside existing spec conventions. Coverage thresholds (75/68/65/75) must hold — the list below is what keeps them.

### 10.1 Unit / component (Vitest)

| New or changed file                                 | Spec                                    | Covers                                                                                                                                                             |
| --------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/layout.tsx`                                | `layout.spec.tsx` (new)                 | chrome rendered with a session, bare children without. Call `await RootLayout({ children })` and inspect the returned tree; do not mount `<html>` in jsdom         |
| `src/app/register/page.tsx`                         | `page.spec.tsx`                         | year groups derived from mocked `getAllClasses`; unavailable notice when site key missing; metadata robots index true                                              |
| `src/app/register/actions.ts`                       | `actions.spec.ts`                       | no secret → error; zod first error; contact parsing per `has_*` flag; Turnstile false → error and no insert; db error message; success → insert + audit + redirect |
| `src/app/register/RegistrationForm.tsx`             | `RegistrationForm.spec.tsx`             | sections render; optional contacts reveal/remove; same-address toggle reveals fields; submit disabled without token; action error displayed                        |
| `src/app/register/success/page.tsx`                 | `page.spec.tsx`                         | renders copy and link                                                                                                                                              |
| `src/clientComponents/TurnstileWidget.tsx`          | `TurnstileWidget.spec.tsx`              | renders container, calls `window.turnstile.render`, forwards token / null on expiry. Mock `next/script` to a no-op and stub `window.turnstile`                     |
| `src/lib/turnstile.ts`                              | `turnstile.spec.ts`                     | success true; success false; fetch throws → false                                                                                                                  |
| `src/lib/registration.ts`                           | `registration.spec.ts`                  | `distinctYearGroups` sorting/dedup, constants exported                                                                                                             |
| `src/lib/schemas.ts`                                | `schemas.spec.ts` (extend)              | §6 cases                                                                                                                                                           |
| `src/lib/permissions.ts`                            | `permissions.spec.ts` (extend)          | both new helpers × 4 roles                                                                                                                                         |
| `src/db/registrations.ts`                           | `registrations.spec.ts`                 | every function; compensating delete on contacts failure; reject/delete throw when no row; rpc args passed through                                                  |
| `src/db/students.ts`                                | `students.spec.ts` (extend)             | `findStudentMatches`, `getStudentsForLinking`; `updateStudent` passes consent fields                                                                               |
| `src/components/StudentDetailsModal.tsx`            | `StudentDetailsModal.spec.tsx` (extend) | Consents section rendered Yes/No for medical-visible roles, hidden for teacher                                                                                     |
| `src/app/students/[id]/edit/EditStudentForm.tsx`    | `EditStudentForm.spec.tsx` (extend)     | consent checkboxes render with defaults                                                                                                                            |
| `src/app/students/[id]/edit/actions.ts`             | `actions.spec.ts` (extend)              | consent booleans forwarded to `updateStudent`                                                                                                                      |
| `src/db/audit-log.ts`                               | `audit-log.spec.ts` (extend)            | accepts new actions                                                                                                                                                |
| `src/proxy.ts`                                      | `proxy.spec.ts` (extend)                | §4.2 cases                                                                                                                                                         |
| `src/app/dashboard/page.tsx`                        | `page.spec.tsx` (extend)                | tile shown for reviewer roles with count, hidden for teacher                                                                                                       |
| `src/app/registrations/page.tsx`                    | `page.spec.tsx`                         | redirect for teacher; default status pending; passes rows                                                                                                          |
| `src/app/registrations/loading.tsx`                 | `loading.spec.tsx`                      | renders skeleton                                                                                                                                                   |
| `src/app/registrations/RegistrationTabs.tsx`        | `RegistrationTabs.spec.tsx`             | active tab, hrefs                                                                                                                                                  |
| `src/app/registrations/RegistrationsTable.tsx`      | `RegistrationsTable.spec.tsx`           | rows, search filter, status badge, links                                                                                                                           |
| `src/app/registrations/actions.ts`                  | `actions.spec.ts`                       | each action: unauthenticated, unauthorised per role, zod failure, db error message, success path (audit + redirect)                                                |
| `src/app/registrations/[id]/page.tsx`               | `page.spec.tsx`                         | redirect for teacher; not found → redirect list; admin gets students-for-linking, others don't                                                                     |
| `src/app/registrations/[id]/RegistrationReview.tsx` | `RegistrationReview.spec.tsx`           | sections render; disabled buttons + tooltip for non-admin; dialogs open                                                                                            |
| `src/app/registrations/[id]/ApproveDialog.tsx`      | `ApproveDialog.spec.tsx`                | create vs link mode; match pre-selected; search filter; submits expected FormData                                                                                  |
| `src/app/registrations/[id]/RejectDialog.tsx`       | `RejectDialog.spec.tsx`                 | reason required; submits                                                                                                                                           |
| `src/security.spec.ts`                              | (extend)                                | `TURNSTILE_SECRET_KEY` in `SECRET_VARS`                                                                                                                            |

### 10.2 E2E (Playwright, `e2e/tests/registrations/`)

- `public-form.e2e.ts` — `test.use({ storageState: { cookies: [], origins: [] } })` like `login.e2e.ts`.
  - Happy path: fill all required sections with a child last name suffixed by `testInfo.project.name`, tick required consents, wait for the Turnstile token (test site key auto-passes), submit, expect `/register/success`; assert a `registration_submissions` row with one `primary` contact via the `db` fixture; `afterEach` deletes by child last name.
  - Validation: submit with a required consent unticked → error shown, no row created.
  - Gate: `/registrations` while unauthenticated → `/login`. `/register` shows no sidebar.
- `review.e2e.ts` — `test.use({ storageState: 'e2e/.auth/admin.json' })` like `add-student.e2e.ts`. `beforeEach` inserts a pending submission + primary contact via `createRegistrationSubmission()` in `e2e/fixtures/seed.ts` with project-unique names.
  - Appears in To-do; open detail; approve as **new student** with class Alpha → URL `/students/<id>/edit`; DB has the student with the submitted consent flags, a guardian, a `student_classes` row; submission `actioned` with `student_id`; row gone from To-do.
  - Approve as **link to existing** against a freshly inserted inactive student → same student id updated, `active` true, `linked_existing` true.
  - Approve with a duplicate `student_code` → readable error, no student/guardian created.
  - Reject with reason → Rejected tab shows it; delete → row gone.
  - Cleanup in `afterEach` (students, guardians, submissions by the unique names).
- `permissions/entitlements.e2e.ts` — add `{ route: '/registrations', allowedRoles: ['admin','headteacher','secretary'], redirectTo: '/dashboard' }` and the same rule for `/registrations/${SEED_IDS.registrations.pending}`.
- `navigation/sidebar.e2e.ts` — Registrations item visible for admin/headteacher/secretary, hidden for teacher.
- `e2e/fixtures/seed.ts` — `SEED_IDS.registrations`, `createRegistrationSubmission(overrides)`, `deleteRegistrationSubmissionsByChildLastName(name)`.

### 10.3 Turnstile in tests and CI

Cloudflare publishes always-pass test keys: site key `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`. Add both to `.env.e2e.example`, to `e2e.yml` env, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to `ci.yml` env so the build renders the form. Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` to `env.d.ts` and `.env.local.example`. Unit tests never hit the network.

---

## 11. Privacy / compliance

- This is **children's data under UK GDPR** held in a staging table before any review. Confirm the Supabase project region is EU/UK.
- The privacy-notice checkbox must link the school's real published notice; photo/media wording must name its uses because it is a single combined consent.
- **No automatic purge (decision 10).** The Rejected tab is the place to clean up; an admin-only delete exists for rejected and stale pending submissions. Recommend the office reviews the Rejected tab each term — a process, not code.
- No IP addresses or other request metadata are stored.
- Every submit, approval, rejection and deletion is audit-logged; approval/rejection/deletion carry the acting `staff_id`.
- The server action never returns submitted data, and the success page holds none.

---

## 12. Build order

Each phase: `npm run fix:all` after substantive edits, `npm run pipeline:check` before calling it done. Phases A–C touch nothing user-visible and can merge independently.

- [ ] **A — Migration + seed + types.** §3 DDL (including the `students` consent columns) in a new migration **and** `supabase/schema.sql`; seed rows; `npm run supabase:reset`; apply to the hosted project; regenerate `src/types/database.ts`.
- [ ] **B — Schemas, helpers, permissions, audit.** §6 schemas + `extractRegistrationContact`, `src/lib/registration.ts`, `src/lib/turnstile.ts`, `canReviewRegistrations` / `canApproveRegistrations`, `AuditAction`, PERMISSIONS.md, `security.spec.ts`. Specs alongside.
- [ ] **C — Data layer.** `src/db/registrations.ts`, `findStudentMatches` / `getStudentsForLinking`, `src/db/index.ts` exports, specs.
- [ ] **D — Public form.** Session gate in `layout.tsx` + `layout.spec.tsx`, `PUBLIC_PATHS` in `proxy.ts` + spec cases, env additions (§10.3), `TurnstileWidget`, `RegistrationForm`, `submitRegistrationAction`, page, success page, specs. `public-form.e2e.ts`.
- [ ] **E — Inbox.** `/registrations` list, tabs, table, loading, nav item, dashboard tile, entitlements/sidebar E2E additions.
- [ ] **F — Review, approve, reject, delete.** Detail page, review client, dialogs, server actions, specs, `review.e2e.ts`. Consents on the student modal and edit page (§8.5).
- [ ] **G — Docs + go-live.** README: add the Turnstile env vars to the environment section, `/register` to the project structure, and this plan to the plans list. Production Turnstile keys in Netlify; confirm privacy-notice URL; add the link on hshb.org.uk (Contentful); smoke-test one real submission end to end and delete it.

---

## 13. Acceptance criteria

**Validation**

- [ ] Missing child first/last/DOB, address line 1/town/postcode, primary contact first/last/phone, or declaration name → blocked by HTML attributes and, if bypassed, by the server action (nothing written).
- [ ] Empty email on any contact accepted; malformed email rejected.
- [ ] Either required consent unticked → blocked client- and server-side.
- [ ] Optional contact sections are only parsed when their `has_*` flag is true.

**Security**

- [ ] Submitting with a missing/invalid Turnstile token → "Verification failed", nothing written; with no `TURNSTILE_SECRET_KEY` → "temporarily unavailable", nothing written.
- [ ] `/register` and `/register/success` load without a session and show no sidebar; `/registrations` redirects to `/login` without one.
- [ ] `src/security.spec.ts` passes: no client file imports `@/db`/`@/auth` or mentions `TURNSTILE_SECRET_KEY`.
- [ ] `teacher` gets no Registrations nav item or dashboard tile and is redirected from `/registrations` and `/registrations/[id]` to `/dashboard`.
- [ ] `secretary`/`headteacher` can open a submission; `approveRegistrationAction`, `rejectRegistrationAction`, `deleteRegistrationAction` return "Not authorised" for their sessions and their buttons are disabled with a tooltip.
- [ ] No route or action allows editing a submission's contents.

**Workflow**

- [ ] A new submission appears under **To-do** and the dashboard tile count increments (after cache revalidation).
- [ ] Approving as **new** creates guardian rows (de-duped on email, else phone digits + last name), a `students` row with correct FKs/relationships and its own address and the submitted consent flags, and a `student_classes` row when a class was chosen; the submission becomes `actioned` with `student_id`, leaves To-do, and the admin lands on the student's edit page.
- [ ] Approving as **link** updates the chosen student in place (names, DOB, address, medical, contacts), reactivates them, overwrites the consent flags, adds the class, and sets `linked_existing = true`. No new `students` row.
- [ ] The review page lists possible existing students by last name + DOB/first name, including inactive ones.
- [ ] An admin can change any consent flag on the student edit page; the modal shows the new values; a teacher sees no Consents section.
- [ ] Approving with an in-use `student_code` fails with a readable message and **creates nothing** (no orphan guardians).
- [ ] Re-approving an actioned submission fails with "already actioned".
- [ ] Rejecting stores the reason and `actioned_by/at` and moves the row to Rejected; deleting removes it and its contacts; actioned submissions cannot be deleted.
- [ ] `students` is only ever written by the approval action — never by the public submit.
- [ ] `audit_log` has rows for submit (`staff_id` null), approve, reject and delete with the acting `staff_id`.

**Quality gate**

- [ ] Every new file in §10.1 has its spec; coverage thresholds hold; `npm run pipeline:check` passes.

---

## 14. Out of scope / follow-ups

Deliberately cut in the complexity review (6 Sep 2026), easy to add later:

- **Reviewer in-place corrections** — an `updateRegistrationSubmission` with contact upsert, a correction schema, and an edit mode on the review page. Add if the office finds post-approval fixes on the student/guardian pages too slow.
- **Per-IP rate limiting** — a `source_ip` column and a count-before-insert. Add if Turnstile alone proves insufficient.
- **Sidebar pending badge** — count in the root layout + `PortalSidebar` prop. The dashboard tile covers the need.
- **Per-field inline errors on the public form** — would need a JSON route or a richer `ActionResult`. HTML attributes plus first-error messages match the staff forms.

Other follow-ups:

- **Address lookup** (§5.4).
- **Staff push notification** on new submission — infra exists (`src/lib/push.ts`, `getAdminSubscriptions`); one call in the server action when wanted.
- **Confirmation email to the parent** — no email sender in the repo (only `mailto:` helpers); would also need the bulk-email plan's Resend integration.
- **Parent consent link** — a single-use link for existing families to confirm or change consents, staged through the same inbox for admin approval. Planned separately in [parent-consent-link.md](parent-consent-link.md); it depends on Phases A–F here.
- **Per-contact guardian match choice** in the review UI if silent de-dup causes surprises (§3.2).
- **Later data:** SEN/EHCP flag, contact priority order, first language / ethnicity — the last is special-category data needing its own lawful basis and separate consent, not a checkbox on this form.
