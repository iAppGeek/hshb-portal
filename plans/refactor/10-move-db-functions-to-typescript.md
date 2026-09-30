# 10 — Move database functions to TypeScript

| Delivers            | Cx  | Reuse | Arch | Size | Depends on |
| ------------------- | :-: | :---: | :--: | :--- | ---------- |
| D0 (part 2), D3, D5 |  8  |   5   |  9   | L    | 09         |

## Goal

Every PL/pgSQL / SQL function becomes a TypeScript function running inside `db.transaction()`.
Remove `supabase-js`, `supabase/schema.sql` and `src/types/database.ts`, and close Supabase's public
Data API off from the tables (RLS stays on; `anon`/`authenticated` lose their grants). After
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
  trigger → dropped; its job (RLS on every new table) moves to `schema.ts` and a spec (see RLS
  below).
- **RLS: keep it enabled, with no policies, on every table.** The app connects as `postgres`, which
  bypasses RLS, so RLS never restricts the app. What it does is block Supabase's public Data API
  (PostgREST/GraphQL at `https://<ref>.supabase.co/rest/v1`), which anyone with the project's
  anon key can call and where `anon` and `authenticated` currently hold `GRANT ALL` on every table.
  RLS with no policies is what denies them today. **Do not** `DISABLE ROW LEVEL SECURITY` and do not
  add policies.
  - Every `pgTable` in `schema.ts` keeps `.enableRLS()`, including tables added later. This
    replaces the `rls_auto_enable` event trigger. Enforce it with a unit spec
    (`src/db/schema.spec.ts`) that iterates every table exported from `schema.ts` and asserts
    `getTableConfig(table).enableRLS === true` (`getTableConfig` from `drizzle-orm/pg-core`).
  - **Revoke the Data API roles** in the plan's migration, so the API has nothing to use even if
    RLS is ever disabled on a table by mistake. Supabase's default privileges otherwise re-grant
    `ALL` on every new table (see the `ALTER DEFAULT PRIVILEGES` lines in `schema.sql`), so revoke
    those too. Leave the `postgres` and `service_role` grants alone.

    ```sql
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    REVOKE USAGE ON SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
    ```

  - The function-specific `REVOKE/GRANT … TO service_role` statements go with the functions.
  - The public `/register` and photo opt-out forms are unaffected: they post to server actions
    (`runAction({ public: true })` + Zod + Turnstile) that write over `DATABASE_URL`; the browser
    never talks to the database. Do not introduce anon-key or RLS-policy writes for them.
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
- **Migration:** one generated migration that drops all functions and triggers (including the
  `rls_auto_enable` event trigger) and revokes the `anon`/`authenticated` grants and default
  privileges. It leaves RLS enabled on every table. `drizzle-kit generate` will produce the
  `$onUpdate` no-op (it's app-side) and detect nothing for functions/policies — write the `DROP`
  statements with `drizzle-kit generate --custom --name=drop_plpgsql` and fill the SQL by hand,
  listing each object by name (copy from `schema.sql`). Verify with `supabase db reset` followed by `npm run db:check`
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
5. Write the `drop_plpgsql` migration (functions, triggers, and the `anon`/`authenticated` revokes
   described under RLS); run `supabase db reset`; `npm run db:check` shows no drift;
   `npm run test:int` and the full E2E suite pass. Add an int spec asserting, against the reset
   database, that every `public` table has `relrowsecurity = true`, that `anon` and
   `authenticated` hold no privileges on any `public` table, sequence or function
   (`information_schema.role_table_grants` / `has_table_privilege`), and that `pg_default_acl` grants
   them nothing in `public`.
6. Delete `supabase/schema.sql`. Remove the `db:dump` / `gen types` scripts from `package.json` and
   README. README "Database" section: schema is `src/db/schema.ts`; integrity = constraints in the
   schema; behaviour = TypeScript in `src/db`.
7. Remove the "service role" paragraphs from `README.md`, `src/lib/PERMISSIONS.md` and
   `src/security.spec.ts` (replace the secret-name check with `DATABASE_URL`). Rewrite any RLS
   paragraph to state the rule above: RLS stays enabled with no policies on every table, the
   Data API roles hold no grants, and the app's authorisation lives in `requireRole` / `runAction`.
   Add the same rule to the "Database" section of `AGENTS.md` so new tables keep `.enableRLS()`.

## Files

**Create:** `src/db/enrolments.ts` + int spec, `supabase/migrations/<ts>_drop_plpgsql.sql`.
**Modify:** `src/db/{registrations,photoOptOuts,classes,students,guardians,fee-plans,academic-years}.ts`

- int specs, `src/db/schema.ts`, `src/lib/db-error.ts`, `e2e/fixtures/seed.ts`, `package.json`,
  `README.md`, `PERMISSIONS.md`, `security.spec.ts`.
  **Delete:** `src/db/supabase-client.ts`, `src/types/database.ts`, `supabase/schema.sql`.

## Acceptance criteria

- `rg "\.rpc\(|supabase-js|types/database|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_URL" src e2e package.json` returns nothing.
- `rg -i "create (or replace )?function|create policy" supabase/migrations/*.sql` matches only files older than this plan's migration; `rg -i "disable row level security" supabase/migrations` returns nothing.
- Every `pgTable` in `schema.ts` has `.enableRLS()` (enforced by `src/db/schema.spec.ts`), every
  `public` table has RLS enabled after `supabase db reset`, and `anon`/`authenticated` hold no
  grants or default privileges in `public` (enforced by the int spec in step 5).
- Every `int.spec.ts` for a ported function covers: happy path, each `RAISE EXCEPTION` branch,
  and that a failure mid-way leaves no partial rows (assert counts after a forced error).
- E2E suites for registrations, photo opt-out, class migration, enrolments and leavers pass
  unchanged — including their error-message assertions.
- `npm run db:check` reports no drift after `supabase db reset`.
- `npm run pipeline:check` green.

## Owner task after deploy

Once this plan is deployed to production and `supabase db push` has applied its migration, turn
off the Data API in the Supabase dashboard (Project Settings → Data API). Nothing uses it once
supabase-js is gone. Do not turn it off earlier: until this plan ships, the remaining `.rpc()`
calls go through it. Then delete `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from
Netlify, and check Supabase's Security Advisor reports no exposed tables.

## Deliberate UX changes

None.
