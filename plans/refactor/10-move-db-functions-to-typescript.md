# 10 — Move database functions to TypeScript

| Delivers            | Cx  | Reuse | Arch | Size | Depends on |
| ------------------- | :-: | :---: | :--: | :--- | ---------- |
| D0 (part 2), D3, D5 |  8  |   5   |  9   | L    | 09         |

## Goal

Every PL/pgSQL / SQL function becomes a TypeScript function running inside `db.transaction()`.
Remove `supabase-js`, the RLS scaffolding, `supabase/schema.sql` and `src/types/database.ts`. After
this plan the only SQL in the repo is the generated migration files and the seed.

## Decisions already made

- **Functions to port (11 called from TS):** `approve_registration`, `apply_photo_opt_out`,
  `create_registration_submission`, `migrate_class`, `set_enrolments`, `save_fee_plan`,
  `set_current_academic_year`, `mark_student_as_leaver`, `find_guardian_matches`,
  `find_student_matches`, plus helpers `close_enrolments`, `is_class_open`, `today_london` that they
  call.
- **Triggers to port:** `set_updated_at` (12 tables) → Drizzle `$onUpdate(() => new Date())` on
  every `updatedAt` column. `prevent_class_academic_year_change` → TypeScript check in
  `updateClass` (throw `DbError('A class\'s academic year cannot be changed')`) **and** keep as
  data-integrity rule by not exposing `academicYearId` in the update type. `rls_auto_enable` event
  trigger → dropped.
- **RLS:** drop every policy and `ALTER TABLE … DISABLE ROW LEVEL SECURITY` for all tables. The
  app connects as `postgres` via the pooler; RLS never applied. Also drop the `REVOKE/GRANT … TO
service_role` function grants (the functions are gone).
- **Where the logic lives:** same module as today's wrapper — `src/db/registrations.ts` owns
  `approveRegistration`, `src/db/classes.ts` owns `migrateClass` and `setClassEnrolments`,
  `src/db/students.ts` owns `setStudentEnrolments` and `markStudentAsLeaver`, etc. Shared pieces
  become small exported helpers taking a `Tx`:
  - `src/db/enrolments.ts`: `closeEnrolments(tx, ids, on)`, `isClassOpen(tx, classId)`,
    `setEnrolments(tx, { studentId } | { classId }, ids)` (the current two-mode function becomes
    two typed overloads sharing one body).
  - `src/db/guardians.ts`: `findGuardianMatches(tx | db, { email, phone, lastName })` — one
    `select … where or(...)` with a `matchedOn` computed via `sql<'email'|'phone'|'name'>` `CASE`.
  - `src/db/students.ts`: `findStudentMatches(tx | db, { firstName, lastName, dateOfBirth })`.
  - `src/lib/dates.ts`: `todayLondon()` already exists in `formatDateInSchoolTz`'s neighbourhood —
    verify and reuse; date-only comparisons pass `YYYY-MM-DD` strings, never `new Date()`.
- **Error semantics:** every `RAISE EXCEPTION 'message'` becomes `throw new DbError('message')`
  (`src/lib/db-error.ts`, `class DbError extends Error`). `getUserFriendlyDbError` returns
  `err.message` for `DbError` and maps postgres codes otherwise. This preserves the strings the
  dialogs and E2E tests expect ("Only active classes in the current academic year can be changed.",
  "Leavers can't be enrolled in classes.", etc.). Copy each message verbatim from `schema.sql`.
- **Isolation:** default `READ COMMITTED`. Where the PL/pgSQL relied on a single statement for
  atomicity across rows (e.g. `set_current_academic_year`'s `UPDATE … SET is_current = (id = p_id)`),
  keep it as **one** Drizzle `update` with a `sql` expression — do not split into two updates.
  `approve_registration` locks the submission row: use `.for('update')` on the initial select.
- **Registration approval** (the largest): port the PL/pgSQL structure step by step into named
  private functions inside `src/db/registrations.ts` so the top-level `approveRegistration` reads
  as a list of steps: `lockSubmission → resolveGuardians → upsertStudent → linkGuardians →
enrol → markApproved`. Each step takes `tx`. Reuse `resolveGuardian` from
  `src/lib/guardians/resolveGuardian.ts` (plan 05) where its semantics match; where the SQL matched
  guardians differently (email/phone/last-name), keep the SQL's rule and note it in a comment.
- **Migration:** one generated migration that drops all functions, triggers, policies, RLS and
  grants. `drizzle-kit generate` will produce the `$onUpdate` no-op (it's app-side) and detect
  nothing for functions/policies — write the `DROP` statements with
  `drizzle-kit generate --custom --name=drop_plpgsql` and fill the SQL by hand, listing each object
  by name (copy from `schema.sql`). Verify with `supabase db reset` followed by `npm run db:check`
  showing no drift.

## Implementation steps

1. `DbError` + `getUserFriendlyDbError` update; `todayLondon()` helper; `$onUpdate` on every
   `updatedAt` column in `schema.ts`.
2. Port in this order, each with an integration spec that exercises the same cases the SQL guarded
   (`*.int.spec.ts`, plan 09 harness):
   1. `setCurrentAcademicYear` (one statement; not-found check first).
   2. `saveFeePlan(input)` — insert-or-update + delete/insert `fee_plan_classes` + the
      "classes must belong to the plan's academic year" check (the `v_wrong_year_count` block).
   3. `findGuardianMatches`, `findStudentMatches`.
   4. `enrolments.ts` helpers, then `setClassEnrolments` / `setStudentEnrolments` and
      `markStudentAsLeaver` (closes all current stays on `todayLondon()`, sets `active=false`,
      `leaver_reason`, `left_at`; throws if already a leaver — check the SQL body).
   5. `migrateClass` — read the ~120-line body carefully; it creates the target class if needed,
      copies open enrolments, closes source enrolments, deactivates the source class. Preserve the
      returned shape used by `admin/_tabs/class-migration`.
   6. `createRegistrationSubmission(submission, contacts)` — insert + insert many, return id.
   7. `applyPhotoOptOut` — find student(s), set `photo_consent=false`, mark submission applied.
   8. `approveRegistration` — as described above.
3. Delete each `.rpc(` call as its replacement lands. When none remain, delete
   `src/db/supabase-client.ts`, remove `@supabase/supabase-js` from `package.json`, delete
   `src/types/database.ts`, and replace remaining `Tables<'x'>` / `Database[...]` type imports with
   `@/db/schema` types (`rg "types/database" src e2e`).
4. `e2e/fixtures/seed.ts`: replace the supabase-js client with a small `postgres` client (same
   `DATABASE_URL`) using tagged-template SQL for the handful of delete/insert helpers, or import
   `db` from `@/db/client` if Playwright's TS config can resolve `server-only` (it can't by default;
   use `postgres` directly).
5. Write the `drop_plpgsql` migration; run `supabase db reset`; `npm run db:check` shows no drift;
   `npm run test:int` and the full E2E suite pass.
6. Delete `supabase/schema.sql`. Remove the `db:dump` / `gen types` scripts from `package.json` and
   README. README "Database" section: schema is `src/db/schema.ts`; integrity = constraints in the
   schema; behaviour = TypeScript in `src/db`.
7. Remove the `RLS` and "service role" paragraphs from `README.md`, `src/lib/PERMISSIONS.md`,
   `src/security.spec.ts` (replace the secret-name check with `DATABASE_URL`).

## Files

**Create:** `src/db/enrolments.ts` + int spec, `supabase/migrations/<ts>_drop_plpgsql.sql`.
**Modify:** `src/db/{registrations,photoOptOuts,classes,students,guardians,fee-plans,academic-years}.ts`

- int specs, `src/db/schema.ts`, `src/lib/db-error.ts`, `e2e/fixtures/seed.ts`, `package.json`,
  `README.md`, `PERMISSIONS.md`, `security.spec.ts`.
  **Delete:** `src/db/supabase-client.ts`, `src/types/database.ts`, `supabase/schema.sql`.

## Acceptance criteria

- `rg "\.rpc\(|supabase-js|types/database|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_URL" src e2e package.json` returns nothing.
- `rg -i "create (or replace )?function|create policy|enable row level security" supabase/migrations/*.sql` matches only files older than this plan's migration.
- Every `int.spec.ts` for a ported function covers: happy path, each `RAISE EXCEPTION` branch,
  and that a failure mid-way leaves no partial rows (assert counts after a forced error).
- E2E suites for registrations, photo opt-out, class migration, enrolments and leavers pass
  unchanged — including their error-message assertions.
- `npm run db:check` reports no drift after `supabase db reset`.
- `npm run pipeline:check` green.

## Deliberate UX changes

None.
