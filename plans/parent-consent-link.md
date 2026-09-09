# Parent Consent Link — Implementation Plan (hshb-portal)

**Depends on:** [parent-registration-form.md](parent-registration-form.md) — Phases A–F must be shipped first. This plan reuses that work's session-gated layout, public-path allowlist, Turnstile widget and verifier, `checkbox` schema helper, consent columns on `students`, permission helpers, audit pattern and inbox.
**Goal:** An admin mints a **single-use link** for an existing student and sends it to the parent. The parent opens a bare page, confirms all five consents, and submits. The result lands in a **staging table** and appears in the Registrations inbox. An **admin** applies it to the student in one atomic action. `students` is still only ever written by an admin action.

---

## 0. Decisions (confirmed with the owner, 6 Sep 2026)

| #   | Decision          | Outcome                                                                                                                                                           |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Approval**      | Consent submissions go through **admin approval** in the inbox, exactly like registrations. The parent page never writes to `students`.                           |
| 2   | **Scope**         | The link lets the parent set **all five** consents (privacy notice, emergency first aid, photo & media, home–school agreement, email & SMS).                      |
| 3   | **Link life**     | **Single use, no expiry.** A link is invalid once used. Minting a new link for a student revokes that student's unused links, so at most one is live per student. |
| 4   | **Placement**     | Separate plan (this file), built after registration ships.                                                                                                        |
| 5   | **Sending**       | v1 is a prefilled `mailto:` to the primary guardian plus a copy button. Bulk sending waits for the Resend integration in `bulk-email-functionality.md`.           |
| 6   | **History**       | The actioned `consent_submissions` row is the record of who consented and when. No extra columns on `students`, no history table.                                 |
| 7   | **Token storage** | Tokens are 32 random bytes, base64url in the URL, stored as a **SHA-256 hash**. The raw token exists only in the URL the admin copies.                            |
| 8   | **Invalid link**  | Used, revoked or unknown tokens all render the same "This link is no longer valid — please contact the school office" page. No 404, no hint which case applies.   |

---

## 1. Repo realities (beyond those in the registration plan)

| Fact (verified)                                                                                                       | Consequence                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/mailto.ts` builds `mailto:` URLs with subject/body and is unit-tested.                                       | Reuse it for the "Email link to parent" button.                                                                                                |
| `src/app/students/[id]/edit/page.tsx` is admin-only (`canEditStudents`) and already loads the student with guardians. | The consent-link panel lives there; no new permission helper needed for minting.                                                               |
| `ActionResult` is `{ error: string } \| void`. Actions that must return data have no existing precedent.              | `createConsentLinkAction` returns `{ url: string } \| { error: string }` — a new `ConsentLinkResult` type in `schemas.ts`, not `ActionResult`. |
| `submission_status` enum and the `set_updated_at()` trigger function exist after the registration migration.          | Reuse both.                                                                                                                                    |
| Node's `crypto` is available in server actions (`web-push` already needs Node runtime).                               | `randomBytes` / `createHash` for tokens; no dependency.                                                                                        |

---

## 2. Architecture

```text
Admin  /students/[id]/edit  → "Create consent link" → createConsentLinkAction
        │  consent_links row (token_hash), older unused links revoked
        │  URL shown once: portal.hshb.org.uk/consent/<token>  + Copy + Email parent (mailto)
        ▼
Parent (anonymous)  /consent/<token>      ← bare layout, public path
        │  <form> → submitConsentAction(FormData)
        │  Turnstile → zod → token lookup (hash, unused, unrevoked) → insert consent_submissions → link used_at → audit
        ▼
consent_submissions (status='pending')  →  /consent/success
        │
        ▼
/registrations?type=consent           ← same inbox, "Consent updates" toggle, reviewer roles
   • [id] → current flags vs submitted flags, then (admin):
        ├── Reject  → status='rejected' + reason
        ├── Delete  → hard delete (rejected/pending only)
        └── Approve → rpc('apply_consent_submission') → students.consent_* updated, status='actioned'
```

---

## 3. Data model

### 3.1 Migration `supabase/migrations/2026MMDDHHMMSS_add_consent_links.sql` (append to `schema.sql` too)

```sql
-- ─── Consent links (single-use, minted by an admin for one student) ──────────

CREATE TABLE consent_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,                    -- sha256 hex of the URL token
  created_by  UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at     TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX ON consent_links (student_id);

-- ─── Consent submissions (staging; approved into students.consent_*) ─────────

CREATE TABLE consent_submissions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status                      submission_status NOT NULL DEFAULT 'pending',
  submitted_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  student_id                  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  link_id                     UUID REFERENCES consent_links(id) ON DELETE SET NULL,
  consent_privacy_notice      BOOLEAN NOT NULL DEFAULT FALSE,
  consent_emergency_first_aid BOOLEAN NOT NULL DEFAULT FALSE,
  consent_photo_media         BOOLEAN NOT NULL DEFAULT FALSE,
  consent_home_school         BOOLEAN NOT NULL DEFAULT FALSE,
  consent_comms_email_sms     BOOLEAN NOT NULL DEFAULT FALSE,
  declaration_name            TEXT NOT NULL,
  actioned_by                 UUID REFERENCES staff(id) ON DELETE SET NULL,
  actioned_at                 TIMESTAMPTZ,
  rejected_reason             TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER consent_submissions_updated_at
  BEFORE UPDATE ON consent_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX ON consent_submissions (status);
CREATE INDEX ON consent_submissions (student_id, submitted_at DESC);

ALTER TABLE consent_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_submissions ENABLE ROW LEVEL SECURITY;
-- No policies: same deny-all-except-service-role model as every other table.

-- ─── Apply a consent submission to its student atomically ────────────────────

CREATE OR REPLACE FUNCTION apply_consent_submission(
  p_submission_id UUID,
  p_staff_id      UUID
) RETURNS UUID AS $$
DECLARE
  v_sub consent_submissions%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM consent_submissions
    WHERE id = p_submission_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consent submission not found or already actioned';
  END IF;

  UPDATE students SET
    consent_privacy_notice      = v_sub.consent_privacy_notice,
    consent_emergency_first_aid = v_sub.consent_emergency_first_aid,
    consent_photo_media         = v_sub.consent_photo_media,
    consent_home_school         = v_sub.consent_home_school,
    consent_comms_email_sms     = v_sub.consent_comms_email_sms
  WHERE id = v_sub.student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student no longer exists';
  END IF;

  UPDATE consent_submissions SET
    status = 'actioned', actioned_by = p_staff_id, actioned_at = NOW()
  WHERE id = p_submission_id;

  RETURN v_sub.student_id;
END;
$$ LANGUAGE plpgsql;
```

### 3.2 Seed (`supabase/seed.sql`)

One unused link for seed student Alice with a **known token** so E2E can open it, and one pending consent submission for Bob:

```text
consent_links        90000000-0000-0000-0000-000000000001  student alice, token_hash = sha256('e2e-consent-token-alice')
consent_submissions  91000000-0000-0000-0000-000000000001  student bob, pending, photo_media = true, declaration "Grace BobGuardian"
```

Mirror ids and the raw seed token in `e2e/fixtures/seed.ts` under `SEED_IDS.consent`. Because the seed link is single-use and each E2E file runs under 8 projects, tests that **submit** mint their own link via the `db` fixture (insert a `consent_links` row with a per-project token) rather than using the seed one.

### 3.3 Types

Regenerate `src/types/database.ts` with the same command as the registration plan. Adds `Tables<'consent_links'>`, `Tables<'consent_submissions'>`, `Functions['apply_consent_submission']`.

---

## 4. Public route

- `src/proxy.ts`: `PUBLIC_PATHS = ['/register', '/consent']`. Add spec cases: unauthenticated `/consent/abc` → no redirect; `/consents` (no such route, but proves the prefix is exact) → `/login`.
- Layout: nothing — the session gate from the registration plan already renders anonymous pages bare.

```text
src/app/consent/
  [token]/
    page.tsx            ← server: hash token, load link+student; invalid → InvalidLink; else <ConsentForm>
    page.spec.tsx
    ConsentForm.tsx     ← 'use client'; five checkboxes, declaration name, TurnstileWidget, hidden token
    ConsentForm.spec.tsx
    actions.ts          ← submitConsentAction (only export)
    actions.spec.ts
  InvalidLink.tsx / InvalidLink.spec.tsx   ← shared "no longer valid" panel
  success/page.tsx / page.spec.tsx
```

Page metadata: `title: { absolute: 'Consent form | Hellenic School of High Barnet' }`, `robots: { index: false, follow: false }` (tokenised URLs must never be indexed).

The page shows: school header, "Consent form for **{first_name} {last_initial}.**", one paragraph explaining the link was sent by the school office, the five consents with the same wording as the registration form (privacy notice linking `PRIVACY_NOTICE_URL`), declaration name, Turnstile, submit. It does **not** show the student's current consent values, address, or any other data — the link may have been forwarded.

---

## 5. Backend

### 5.1 `src/lib/consent-token.ts` (+ spec)

```ts
export function generateConsentToken(): string // randomBytes(32).toString('base64url')
export function hashConsentToken(token: string): string // createHash('sha256').update(token).digest('hex')
```

Server-only by usage (imported from actions and `src/db`); no client component imports it.

### 5.2 `src/db/consents.ts` (+ spec, exported from `src/db/index.ts`)

```ts
export type ConsentSubmissionSummary = { id, status, submitted_at, declaration_name, student: { id, first_name, last_name, student_code } }
export type ConsentSubmissionFull = Tables<'consent_submissions'> & { student: { id, first_name, last_name, consent_privacy_notice, …five flags } }

createConsentLink({ studentId, tokenHash, staffId }): Promise<{ id: string }>
  // UPDATE consent_links SET revoked_at = NOW() WHERE student_id = $1 AND used_at IS NULL AND revoked_at IS NULL;
  // then INSERT the new row
getConsentLinkForToken(tokenHash): Promise<{ id, student: { id, first_name, last_name } } | null>
  // .eq('token_hash').is('used_at', null).is('revoked_at', null) with students(...) embed
createConsentSubmission({ linkId, studentId, flags, declarationName }): Promise<{ id: string }>
  // insert submission, then UPDATE consent_links SET used_at = NOW() WHERE id = linkId AND used_at IS NULL .select('id');
  // if that update returns no row (race: link used between page load and submit), delete the submission and throw 'Link already used'
  // revalidateTag('registrations')
getConsentSubmissions(status | 'all'): Promise<ConsentSubmissionSummary[]>      // unstable_cache, tag 'registrations'
getPendingConsentSubmissionCount(): Promise<number>                             // unstable_cache, tag 'registrations'
getConsentSubmissionById(id): Promise<ConsentSubmissionFull | null>             // unstable_cache, tag 'registrations'
applyConsentSubmission({ submissionId, staffId }): Promise<string>              // rpc; revalidateTag registrations, students
rejectConsentSubmission({ submissionId, staffId, reason })                      // as rejectRegistration
deleteConsentSubmission(id)                                                     // as deleteRegistrationSubmission
```

### 5.3 `submitConsentAction` (`src/app/consent/[token]/actions.ts`)

Same shape as `submitRegistrationAction`:

1. No `TURNSTILE_SECRET_KEY` → "temporarily unavailable".
2. `consentSubmissionSchema.safeParse(extractFormFields(formData))` → first error.
3. `getConsentLinkForToken(hashConsentToken(parsed.token))` → null → `{ error: 'This link is no longer valid.' }`.
4. `verifyTurnstileToken` → false → "Verification failed".
5. `createConsentSubmission(...)`; `logAuditEvent({ staffId: null, action: 'consent_submitted', entity: 'consent_submission', entityId: id })`.
6. `redirect('/consent/success')`.

Only export from the file.

### 5.4 `createConsentLinkAction` (`src/app/students/[id]/edit/actions.ts`, added beside `updateStudentAction`)

`auth()` → `canEditStudents` → `uuid.parse(studentId)` → `generateConsentToken()` → `createConsentLink({ studentId, tokenHash: hash, staffId })` → `logAuditEvent({ action: 'consent_link_created', entity: 'student', entityId: studentId })` → return `{ url: \`${process.env.AUTH_URL}/consent/${token}\` }`. The raw token is never stored or logged.

---

## 6. Validation (`src/lib/schemas.ts`)

```ts
export const consentSubmissionSchema = z.object({
  token: requiredString,
  consent_privacy_notice: checkbox,
  consent_emergency_first_aid: checkbox,
  consent_photo_media: checkbox,
  consent_home_school: checkbox,
  consent_comms_email_sms: checkbox,
  declaration_name: requiredString,
  turnstile_token: requiredString,
})

export type ConsentLinkResult = { url: string } | { error: string }
```

No consent is required here — a parent may legitimately withdraw any of them. (The registration form still requires privacy notice and first aid because a child cannot be enrolled without them; if a withdrawal of those arrives, the admin sees it in the inbox and decides.) Reject reuses `rejectRegistrationSchema`.

---

## 7. Permissions and audit

No new permission helpers. Minting uses `canEditStudents`; the inbox uses `canReviewRegistrations` / `canApproveRegistrations`.

`AuditAction` gains `'consent_link_created' | 'consent_submitted' | 'consent_approved' | 'consent_rejected' | 'consent_deleted'`.

---

## 8. Admin UI

### 8.1 Consent link panel — `/students/[id]/edit`

`ConsentLinkPanel.tsx` (`'use client'`, beside `EditStudentForm.tsx`, + spec), rendered under the form's Consents section:

- "Create consent link" button → `createConsentLinkAction(studentId)`.
- On success shows the URL once in a read-only input with **Copy** (`navigator.clipboard`, as `PortalSidebar` does for email) and **Email parent** — a `mailto:` built with `src/lib/mailto.ts` to the primary guardian's email (disabled with a tooltip when the guardian has no email), subject "HSHB consent form for {first name}", body containing the link.
- A line of copy: "Creating a new link cancels any earlier unused link for this student."
- Props: `studentId`, `studentFirstName`, `primaryGuardianEmail: string | null`. The edit page already has the guardian data to pass.

### 8.2 Inbox — `/registrations?type=consent`

- `RegistrationTabs` gains a type toggle above the status tabs: **Registrations | Consent updates**, preserving `status`. The page reads `type` (default `registration`) and calls `getConsentSubmissions` or `getRegistrationSubmissions`.
- `ConsentSubmissionsTable.tsx` (+ spec): Student (name + code), Submitted, Signed by, Status; rows link to `/registrations/consents/[id]`.
- Dashboard tile: the "Pending registrations" tile becomes **Inbox** showing "N registrations · M consent updates", linking to `/registrations`. Extend `dashboard/page.spec.tsx`.

### 8.3 Review — `/registrations/consents/[id]`

```text
src/app/registrations/consents/
  actions.ts / actions.spec.ts            ← approve / reject / delete
  [id]/page.tsx / page.spec.tsx           ← auth guard, loads submission (+ student's current flags)
  [id]/loading.tsx / loading.spec.tsx
  [id]/ConsentReview.tsx / .spec.tsx      ← 'use client'; comparison table + action buttons
```

- Comparison table: one row per consent, columns **Current** / **Submitted**, changed rows highlighted. Signed by and submitted date beneath. Workflow panel as for registrations.
- **Approve & apply** (admin) → `approveConsentSubmissionAction(id)` → `applyConsentSubmission` → audit `consent_approved` with `{ studentId }` → `revalidatePath` `/registrations`, `/dashboard`, `/students` → `redirect('/students')`.
- **Reject** (admin, reason required) and **Delete** (admin, non-actioned only) mirror the registration actions. Reuse `RejectDialog` from `registrations/[id]` by moving it to `src/app/registrations/_components/RejectDialog.tsx` (update the import in `RegistrationReview.tsx`).
- Headteacher/secretary: buttons disabled with `Tooltip`.

---

## 9. Tests

### 9.1 Unit / component (Vitest)

| New or changed file                                     | Spec                                 | Covers                                                                                         |
| ------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `src/lib/consent-token.ts`                              | `consent-token.spec.ts`              | token length/charset, hash deterministic and hex                                               |
| `src/lib/schemas.ts`                                    | `schemas.spec.ts` (extend)           | `consentSubmissionSchema` accepts all-unticked; missing token/name/turnstile rejected          |
| `src/db/consents.ts`                                    | `consents.spec.ts`                   | every function; revoke-then-insert order; used_at race → compensating delete + throw; rpc args |
| `src/db/audit-log.ts`                                   | `audit-log.spec.ts` (extend)         | new actions                                                                                    |
| `src/proxy.ts`                                          | `proxy.spec.ts` (extend)             | `/consent/*` public; `/consents` gated                                                         |
| `src/app/consent/[token]/page.tsx`                      | `page.spec.tsx`                      | invalid/used/revoked → InvalidLink; valid → form with name initial; metadata noindex           |
| `src/app/consent/[token]/ConsentForm.tsx`               | `ConsentForm.spec.tsx`               | five checkboxes; submit disabled without token; action error shown                             |
| `src/app/consent/[token]/actions.ts`                    | `actions.spec.ts`                    | no secret; zod; invalid link; Turnstile false; db error; success → insert + audit + redirect   |
| `src/app/consent/InvalidLink.tsx`                       | `InvalidLink.spec.tsx`               | renders copy                                                                                   |
| `src/app/consent/success/page.tsx`                      | `page.spec.tsx`                      | renders copy                                                                                   |
| `src/app/students/[id]/edit/actions.ts`                 | `actions.spec.ts` (extend)           | `createConsentLinkAction`: unauthorised; success returns url, stores hash not token, audits    |
| `src/app/students/[id]/edit/ConsentLinkPanel.tsx`       | `ConsentLinkPanel.spec.tsx`          | mint → url shown; copy; mailto href; email button disabled without guardian email              |
| `src/app/students/[id]/edit/page.tsx`                   | `page.spec.tsx` (extend)             | passes guardian email to panel                                                                 |
| `src/app/registrations/page.tsx`                        | `page.spec.tsx` (extend)             | `type=consent` loads consent submissions                                                       |
| `src/app/registrations/RegistrationTabs.tsx`            | `RegistrationTabs.spec.tsx` (extend) | type toggle hrefs preserve status                                                              |
| `src/app/registrations/ConsentSubmissionsTable.tsx`     | `ConsentSubmissionsTable.spec.tsx`   | rows, status, links                                                                            |
| `src/app/registrations/consents/actions.ts`             | `actions.spec.ts`                    | each action: unauthenticated, unauthorised, db error, success (audit + redirect)               |
| `src/app/registrations/consents/[id]/page.tsx`          | `page.spec.tsx`                      | guard; not found → redirect                                                                    |
| `src/app/registrations/consents/[id]/ConsentReview.tsx` | `ConsentReview.spec.tsx`             | current vs submitted highlighting; disabled buttons for non-admin                              |
| `src/app/registrations/_components/RejectDialog.tsx`    | `RejectDialog.spec.tsx` (moved)      | unchanged                                                                                      |
| `src/app/dashboard/page.tsx`                            | `page.spec.tsx` (extend)             | inbox tile shows both counts                                                                   |

### 9.2 E2E (`e2e/tests/consent/`)

- `public-form.e2e.ts` — unauthenticated. `beforeEach` inserts a `consent_links` row for Alice with a per-project token via the `db` fixture (hash computed in the test with Node `crypto`). Open `/consent/<token>` → child name shown → tick photo consent → submit → `/consent/success`; DB has a pending `consent_submissions` row and the link's `used_at` set. Reopen the same URL → "no longer valid". Unknown token → same page. `afterEach` deletes the link and submission.
- `review.e2e.ts` — admin. `beforeEach` inserts a pending consent submission for Bob (photo true). Inbox `?type=consent` shows it → detail shows Current No / Submitted Yes → Approve → Bob's `consent_photo_media` true, submission actioned. Reject and delete paths. Cleanup resets Bob's flags.
- `permissions/entitlements.e2e.ts` — add `/registrations/consents/${SEED_IDS.consent.pending}`.
- `students/add-student.e2e.ts` untouched; add `students/consent-link.e2e.ts` (admin): open Alice's edit page → Create consent link → URL appears and matches `/consent/[A-Za-z0-9_-]{43}/`; DB has a `consent_links` row for Alice with `revoked_at` null; create again → first row now revoked.

---

## 10. Privacy / compliance

- The parent page shows only the child's first name and last initial. No current consents, address or contacts are revealed to a link holder.
- Tokens are stored hashed; a database read cannot reconstruct a live link.
- Links are single-use and revoked when a new one is minted; there is no expiry (decision 3), so the office should mint links when they intend to send them, not in advance.
- Tokenised pages are `noindex`, and the success page holds no data.
- Every mint, submit, approve, reject and delete is audit-logged; mint/approve/reject/delete carry the staff id.
- Actioned consent submissions are kept as the consent record; rejected ones can be deleted from the inbox.

---

## 11. Build order

- [ ] **A — Migration + seed + types.** §3 DDL in a new migration and `schema.sql`; seed link and submission; `supabase:reset`; apply to hosted; regenerate types.
- [ ] **B — Lib + schema + audit.** `consent-token.ts`, `consentSubmissionSchema`, `ConsentLinkResult`, `AuditAction`. Specs.
- [ ] **C — Data layer.** `src/db/consents.ts` + exports + spec.
- [ ] **D — Public page.** Proxy allowlist, `/consent/[token]` page, form, action, invalid + success pages, specs, `consent/public-form.e2e.ts`.
- [ ] **E — Minting.** `createConsentLinkAction`, `ConsentLinkPanel`, edit-page wiring, specs, `students/consent-link.e2e.ts`.
- [ ] **F — Inbox + review.** Type toggle, consent table, dashboard tile, review page, actions, `RejectDialog` move, specs, `consent/review.e2e.ts`, entitlements rule.
- [ ] **G — Docs.** README: `/consent` in project structure, this plan in the plans list.

Every phase: `npm run fix:all` after substantive edits, `npm run pipeline:check` before calling it done.

---

## 12. Acceptance criteria

- [ ] An admin can mint a link from a student's edit page, copy it, and open a prefilled email to the primary guardian; minting again revokes the earlier unused link.
- [ ] Headteacher, secretary and teacher cannot mint links (`createConsentLinkAction` returns "Not authorised"; the panel is not rendered because the edit page is admin-only).
- [ ] The parent page shows the child's first name and last initial only, and renders the generic invalid page for unknown, used and revoked tokens.
- [ ] Submitting stages a `consent_submissions` row, marks the link used, audit-logs with no staff id, and never touches `students`.
- [ ] A second submit on the same link is refused and creates nothing.
- [ ] The inbox's Consent updates view lists pending submissions; the review page highlights changed flags.
- [ ] Approving copies the five flags onto the student atomically and marks the submission actioned; re-approving fails with "already actioned".
- [ ] Reject stores reason and actor; delete works only on non-actioned rows.
- [ ] `src/security.spec.ts` passes; `/consent/*` client files import neither `@/db` nor `@/auth`.
- [ ] Every new file in §9.1 has its spec; coverage thresholds hold; `npm run pipeline:check` passes.

---

## 13. Out of scope / follow-ups

- **Bulk minting and sending** ("send consent links to every family missing photo consent") — needs the Resend integration from `bulk-email-functionality.md`; the minting function here is designed to be called in a loop.
- **Link expiry / reminders** — decision 3 says none; add an `expires_at` column if stale links become a problem.
- **Consent history table** — the actioned submissions already give a timeline per student; a dedicated table is only needed if the registration approval path should also appear in the same timeline view.
