# Integration Test Plan: Playwright E2E Tests for HSHB Portal

## Status

**Phase 1 (foundation) and a first slice of Priority 1/3 tests are shipped.** Files in place: `playwright.config.ts`, `e2e/auth.setup.ts`, `e2e/global-setup.ts`, `e2e/fixtures/{index,seed}.ts`, `supabase/seed.sql`, `supabase/migrations/00000000000000_initial_schema.sql`, `.github/workflows/e2e.yml`, npm scripts (`test:e2e`, `test:e2e:ui`, `supabase:*`), and the test-credentials provider in `src/auth/config.ts`. The `.env.e2e` file lives locally and is consumed via `dotenv-cli`.

Tests landed so far:

- ✅ `e2e/tests/auth/login.e2e.ts`
- ✅ `e2e/tests/navigation/sidebar.e2e.ts`
- ✅ `e2e/tests/permissions/entitlements.e2e.ts`
- ✅ `e2e/tests/students/add-student.e2e.ts`

Everything below this status block describes the **remaining work** — read it as a backlog of test files and behaviours still to add, with the original design rationale preserved so a new picker-upper has the full context.

---

## Context

The portal has 579+ unit tests via Vitest but limited integration/E2E coverage. Unit tests mock all external dependencies (Supabase, NextAuth), so without integration tests there's no end-to-end verification that auth flow, database queries, permission enforcement in the browser, responsive layout, and form submissions all work together. The plan builds Playwright-based integration tests against a local Supabase database, covering every portal feature across all 4 roles and both desktop/mobile viewports.

---

## 1. Infrastructure — ✅ shipped

Original design (kept for reference; everything below is now in the repo):

### Supabase local development

The Supabase CLI (Docker-backed) spins up an isolated local PostgreSQL on `http://127.0.0.1:54321`. `supabase db reset` applies migrations + seed and gives fully reproducible test state.

Files in place: `supabase/config.toml`, `supabase/migrations/00000000000000_initial_schema.sql`, `supabase/seed.sql`.

### Playwright

Installed `@playwright/test` + `dotenv-cli`; `npx playwright install chromium`. `playwright.config.ts` defines a project matrix (4 roles × 2 viewports = 8 projects, plus 1 auth setup project). A single setup project runs `auth.setup.ts` which loops over all 4 roles and produces a `storageState` JSON per role under `e2e/.auth/`.

`webServer` boots `next dev` via `dotenv-cli` so E2E env vars reach the dev server. `globalSetup` runs `supabase db reset` for a clean DB. A prerequisite guard in `global-setup.ts` throws a descriptive error if local Supabase is unreachable.

`.gitignore` covers `e2e/.results/`, `e2e/.report/`, `e2e/.auth/`.

### npm scripts

```json
"test:e2e": "dotenv -e .env.e2e -- playwright test",
"test:e2e:ui": "dotenv -e .env.e2e -- playwright test --ui",
"supabase:start": "supabase start",
"supabase:stop": "supabase stop",
"supabase:reset": "supabase db reset"
```

`pipeline:check` includes `test:e2e`.

---

## 2. Auth strategy — ✅ shipped

Microsoft Entra OAuth can't be driven from automated tests. Solution: a conditional `Credentials` provider in `src/auth/config.ts`, only loaded when `process.env.E2E_TEST === 'true'` and `NODE_ENV !== 'production'`. The provider accepts email + a static test secret, looks up the staff record via `getStaffByEmail()`, and returns the same user shape as the production flow so JWT/session callbacks behave identically.

`src/app/login/page.tsx` shows a hidden test login form when `E2E_TEST=true`. `e2e/auth.setup.ts` logs in as each role and saves the `storageState`.

`.env.e2e` (gitignored locally; CI supplies values via secrets) contains the deterministic `E2E_TEST_SECRET`, `AUTH_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, and the well-known local-Supabase service role key.

---

## 3. Test directory structure — partially shipped

```
e2e/
  auth.setup.ts                     ✅
  global-setup.ts                   ✅
  fixtures/
    index.ts                        ✅
    seed.ts                         ✅
  tests/
    auth/
      login.e2e.ts                 ✅ shipped
    navigation/
      sidebar.e2e.ts               ✅ shipped
    permissions/
      entitlements.e2e.ts          ✅ shipped
    dashboard/
      dashboard.e2e.ts             ⬜ pending — cards and data visibility per role
    students/
      students-list.e2e.ts         ⬜ pending — listing, search, role-based filtering
      students-create.e2e.ts       🟡 partial — add-student.e2e.ts covers the happy path; missing role-redirect + validation cases
      students-edit.e2e.ts         ⬜ pending — admin-only edit form
    staff/
      staff-list.e2e.ts            ⬜ pending — listing, contact visibility per role
      staff-create.e2e.ts          ⬜ pending — admin only
      staff-edit.e2e.ts            ⬜ pending — admin only
    classes/
      classes-list.e2e.ts          ⬜ pending
      classes-create.e2e.ts        ⬜ pending — admin + headteacher
      classes-edit.e2e.ts          ⬜ pending — admin + headteacher
    attendance/
      attendance.e2e.ts            ⬜ pending — register selection, save, role restrictions
    staff-attendance/
      staff-attendance.e2e.ts      ⬜ pending — sign-in/out, self-only for teacher/secretary
    incidents/
      incidents-list.e2e.ts        ⬜ pending
      incidents-create.e2e.ts      ⬜ pending — all authenticated roles
      incidents-edit.e2e.ts        ⬜ pending — admin + headteacher only
    lesson-plans/
      lesson-plans-list.e2e.ts     ⬜ pending
      lesson-plans-create.e2e.ts   ⬜ pending — teacher (own classes), admin, headteacher
      lesson-plans-edit.e2e.ts     ⬜ pending
    guardians/
      guardians-edit.e2e.ts        ⬜ pending — admin only
    timetables/
      timetables.e2e.ts            ⬜ pending — slot visibility per role
    reports/
      reports.e2e.ts               ⬜ pending — admin, headteacher, secretary only
```

---

## 4. Desktop vs mobile testing

Every spec runs in both desktop and mobile Playwright projects via the config matrix. Tests use the `isMobile` fixture in `e2e/fixtures/index.ts` to handle viewport-specific assertions.

**Desktop assertions:**

- Sidebar permanently visible
- Full table columns with headers
- "Add" buttons in their desktop positions

**Mobile assertions:**

- Top bar with hamburger menu visible
- Sidebar hidden by default, opens as drawer on tap
- Card-based layout replacing tables
- Drawer closes after navigation

```ts
// e2e/fixtures/index.ts (already in repo)
export const test = base.extend<{ isMobile: boolean }>({
  isMobile: async ({ page }, use) => {
    const vp = page.viewportSize()
    await use(vp ? vp.width < 768 : false)
  },
})
```

---

## 5. Remaining tests to write (by priority)

### Priority 2: Data visibility & filtering per role

These verify each role sees the correct data and UI controls. The seed has 2 teachers (teacher1 owns Alpha with Alice+Bob, teacher2 owns Beta with Carol), so teacher-level filtering is testable.

**Headteacher edit permissions (per `src/lib/permissions.ts`):**

- **CAN edit**: classes, incidents, lesson plans, timetables
- **CANNOT edit**: students, staff, guardians (admin-only)

Tables below reflect actual code, not a simplified model.

**`students-list.e2e.ts` — student visibility:**

| Assertion                                         | admin | headteacher           | secretary             | teacher                     |
| ------------------------------------------------- | ----- | --------------------- | --------------------- | --------------------------- |
| Sees Alice, Bob, Carol (all students)             | yes   | yes                   | yes                   | no                          |
| Teacher sees only own class students (Alice, Bob) | n/a   | n/a                   | n/a                   | yes                         |
| "Add student" button is a clickable link          | yes   | no (disabled tooltip) | no (disabled tooltip) | no (hidden)                 |
| "Edit" link visible on each row                   | yes   | no                    | no                    | no                          |
| Medical/allergy info columns visible              | yes   | yes                   | yes                   | no (`canSeeStudentMedical`) |

**`staff-list.e2e.ts` — staff visibility:**

| Assertion                              | admin | headteacher           | secretary             | teacher                   |
| -------------------------------------- | ----- | --------------------- | --------------------- | ------------------------- |
| Sees all 5 staff members               | yes   | yes                   | yes                   | yes                       |
| Contact number column visible          | yes   | yes                   | yes                   | no (`canSeeStaffContact`) |
| "Add staff" button is a clickable link | yes   | no (disabled tooltip) | no (disabled tooltip) | no (hidden)               |
| "Edit" link visible on each row        | yes   | no                    | no                    | no                        |

**`classes-list.e2e.ts` — class visibility:**

| Assertion                               | admin | headteacher | secretary             | teacher     |
| --------------------------------------- | ----- | ----------- | --------------------- | ----------- |
| Sees all 3 classes (Alpha, Beta, Gamma) | yes   | yes         | yes                   | no          |
| Teacher sees only own class (Alpha)     | n/a   | n/a         | n/a                   | yes         |
| "Add class" button is a clickable link  | yes   | yes         | no (disabled tooltip) | no (hidden) |
| "Edit" link visible on each row         | yes   | yes         | no                    | no          |
| Teacher name shown on each class        | yes   | yes         | yes                   | yes         |
| Student count shown on each class       | yes   | yes         | yes                   | yes         |

**`attendance.e2e.ts` — class selector filtering:**

| Assertion                             | admin | headteacher | secretary | teacher |
| ------------------------------------- | ----- | ----------- | --------- | ------- |
| Class dropdown shows all classes      | yes   | yes         | yes       | no      |
| Teacher dropdown shows only own class | n/a   | n/a         | n/a       | yes     |
| Can save attendance (toggle + submit) | yes   | yes         | new only  | yes     |

**`incidents-list.e2e.ts` — incident visibility:**

| Assertion             | admin | headteacher | secretary | teacher           |
| --------------------- | ----- | ----------- | --------- | ----------------- |
| Sees all incidents    | yes   | yes         | yes       | own students only |
| "Edit" link visible   | yes   | yes         | no        | no                |
| "New incident" button | yes   | yes         | yes       | yes               |

**`lesson-plans-list.e2e.ts` — lesson plan visibility:**

| Assertion                                     | admin | headteacher | secretary | teacher          |
| --------------------------------------------- | ----- | ----------- | --------- | ---------------- |
| Sees all lesson plans                         | yes   | yes         | yes       | own classes only |
| "Create" button visible                       | yes   | yes         | no        | yes              |
| "Edit" link visible                           | yes   | yes         | no        | own only         |
| Teacher class dropdown on create: all classes | yes   | yes         | n/a       | own classes only |

**`staff-attendance.e2e.ts` — staff sign-in/out visibility:**

| Assertion                             | admin | headteacher | secretary | teacher |
| ------------------------------------- | ----- | ----------- | --------- | ------- |
| Sees all non-admin staff on the sheet | yes   | yes         | yes       | no      |
| Teacher sees only own row             | n/a   | n/a         | n/a       | yes     |
| Can sign in/out any staff member      | yes   | yes         | no        | no      |
| Can sign in/out self only             | n/a   | n/a         | yes       | yes     |
| Date picker visible                   | yes   | yes         | yes       | yes     |

Note: `showsOnSignInSheet(role)` returns `role !== 'admin'` — admin does NOT appear on the sign-in sheet; all other roles do.

**`timetables.e2e.ts` — timetable visibility:**

| Assertion                               | admin | headteacher | secretary | teacher |
| --------------------------------------- | ----- | ----------- | --------- | ------- |
| Sees all timetable slots across classes | yes   | yes         | yes       | no      |
| Teacher sees only own class slots       | n/a   | n/a         | n/a       | yes     |
| Slots grouped by day of week            | yes   | yes         | yes       | yes     |

### Priority 3: CRUD workflow tests

- **Students create/edit:** Admin submits create form, edit form loads with existing data, validation errors display. Headteacher/teacher/secretary redirected from `/students/new`. (Add-student happy path is already covered; remaining: redirect tests, validation paths, edit flow.)
- **Staff create/edit:** Admin only. Same pattern as students.
- **Classes create/edit:** Admin and headteacher can create/edit. Teacher/secretary redirected.
- **Attendance save:** Toggle statuses, submit, reload to verify persistence. Teacher submits for own class only.
- **Staff Attendance:** Teacher signs self in/out only. Admin/headteacher manage all staff.
- **Incidents create/edit:** All roles create. Only admin/headteacher can edit existing.
- **Lesson Plans create/edit:** Teacher creates for own class, admin/headteacher for any class. Duplicate class+date rejected with error.
- **Guardians edit:** Admin only. All others redirected from `/guardians/{id}/edit`.

### Priority 4: Reports & dashboard

- **Reports:** Role-gated (admin/headteacher/secretary), teacher redirected. Date/mode selection changes data.
- **Dashboard:** Role-appropriate cards and counts. Teacher sees "My Students"/"My Classes" only.

### Actions testing

Each CRUD test naturally covers the server action by submitting the form and verifying the result. Key action-level tests:

- Permission denied returns error (e.g., teacher trying to create student via direct form post)
- Zod validation errors display in the form
- Audit log entries created (verify via direct DB query in `e2e/fixtures/seed.ts` helper)
- `revalidatePath` causes fresh data on redirect

---

## 6. Seed data (`supabase/seed.sql`) — ✅ shipped

Minimal but sufficient:

- **5 staff**: 1 admin, 2 teachers, 1 headteacher, 1 secretary (deterministic UUIDs)
- **3 classes**: Alpha (teacher1), Beta (teacher2), Gamma (headteacher)
- **3 students**: Alice + Bob in Alpha, Carol in Beta
- **3 guardians**: one per student
- **3 student_classes** enrollments
- **3 timetable_slots**
- **2 incidents**: 1 medical, 1 behaviour
- **1 lesson_plan**: for Alpha class

All IDs use deterministic UUIDs (`00000000-...`, `10000000-...`, etc.) for reliable assertions.

### Data isolation

- `e2e/global-setup.ts` runs `supabase db reset` before the suite.
- Mutation tests use `test.afterEach` to clean up via a direct Supabase client in `e2e/fixtures/seed.ts`.
- Read-only tests run first (project ordering), mutation tests after.

---

## 7. CI/CD — ✅ shipped

`.github/workflows/e2e.yml` installs the Supabase CLI, starts Postgres (Docker is available in GH Actions), runs `supabase db reset`, installs Playwright Chromium, and runs the test suite. Reports are uploaded as artifacts on failure.

Not run in Netlify builds (no Docker there) — Netlify continues running unit tests only.

---

## 8. Files still to create/modify

Only the new spec files in Section 3 remain. All infrastructure is in place.

---

## 9. Implementation order for remaining work

1. **Priority 2** — fill in the per-role data-visibility tests (`students-list`, `staff-list`, `classes-list`, `attendance`, `incidents-list`, `lesson-plans-list`, `staff-attendance`, `timetables`). These give the highest confidence per hour because they exercise every page across all roles.
2. **Priority 3** — CRUD workflow tests for the modules above, plus guardian edit. Pick up alongside any feature work on the relevant module.
3. **Priority 4** — dashboard + reports. Lower priority because they're read-only views with limited regression surface.
4. **Mobile drawer assertions** — once Priority 2 has reasonable coverage, sweep through and add `isMobile`-conditional assertions to existing specs.

---

## 10. Coding conventions

All E2E test code follows the project's established conventions:

- **TypeScript strict mode** — explicit return types on all functions, no `any` (use `unknown` and narrow)
- **Prefer `type` over `interface`** unless extending
- **PascalCase** for types, **camelCase** for functions/variables, **kebab-case** for directories
- **No TODO comments** — implement or skip
- **ESLint + Prettier** — all new files must pass `npm run lint` and `npm run format:check`
- **Conventional commits** enforced (e.g., `test(e2e): add attendance role visibility tests`)
- **Test naming**: descriptive `test.describe` and `test()` names that read like requirements
- **Selectors**: prefer `data-testid` attributes and accessible roles (`getByRole`, `getByLabel`) over CSS selectors
- **Assertions**: use Playwright's built-in `expect(page)` and `expect(locator)` matchers with auto-retry

---

## 11. Known risks & mitigations

| Risk                                                                                       | Mitigation                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NextAuth JWT signing** — storageState cookies must be signed with the same `AUTH_SECRET` | `.env.e2e` sets a deterministic `AUTH_SECRET`; the dev server and auth setup both use it                                                             |
| **`server-only` import in `src/db/client.ts`**                                             | Not an issue — E2E tests interact via the browser, never import app code directly. The `e2e/fixtures/seed.ts` helper creates its own Supabase client |
| **Race conditions after form submit**                                                      | Always `await page.waitForURL(...)` after actions that trigger `redirect()`, never rely on timing                                                    |
| **Time-sensitive tests** (attendance, dashboard "today")                                   | Seed uses `CURRENT_DATE`/`NOW()` in SQL. Consider `page.clock.setFixedTime()` if flaky across midnight                                               |
| **Docker not running**                                                                     | `global-setup.ts` checks Supabase health endpoint and throws descriptive error before tests run                                                      |
| **Netlify build**                                                                          | E2E tests only run locally and in GitHub Actions (Docker available). Netlify continues running unit tests only                                       |

---

## 12. Verification

For new tests added off this plan:

1. `npm run supabase:start && npm run supabase:reset` — local DB ready
2. `npm run test:e2e -- <path-to-new-spec>` — new spec passes across all 8 projects (4 roles × 2 viewports)
3. `npm run test:e2e:ui` — visual Playwright UI shows the new spec grouped correctly
4. `npm run pipeline:check` — full gate still passes
5. Open a PR — GitHub Actions runs the suite in CI
