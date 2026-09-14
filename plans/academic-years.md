# Academic Years — one list every year-bound record hangs off (hshb-portal)

**Goal:** Make the academic year a first-class record instead of free text, and link classes, fee plans, fee accounts and payments to it. Admins can then look back at any year and see its classes, class lists, registers and each student's fee position, including balances still owed from earlier years. This plan is the basis for `~/.claude/plans/review-the-database-structure-rustling-owl.md` (register history & leavers), which assumes it is already implemented.

---

## 0. Decisions (confirmed with the owner, 14 Sep 2026)

| #   | Decision                 | Outcome                                                                                                                                                                                                                                              |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Source of truth**      | New `academic_years` table. Exactly one row is **current**. Everything year-bound references it by id; the text column on classes and fee plans is dropped.                                                                                          |
| 2   | **What links to a year** | **Directly:** classes, fee plans, student fee accounts, student payments. **Via class:** attendance, lesson plans, timetable slots, student class links. **Via date:** incidents. Staff records are not year-bound.                                  |
| 3   | **Fees**                 | One fee plan per student per year (unchanged). Fee account becomes **one row per student per year**. Payments carry the year they pay for, defaulting from the payment date but editable, so a late payment can settle last year's balance.          |
| 4   | **Outstanding balance**  | Finance shows, per student, this year's status **and** the total still owed from earlier years. A per-year **settled** flag + note lets finance close a year that is written off or agreed as paid.                                                  |
| 5   | **Year rollover**        | Manual. Admin creates the next year and makes it current from a new **Academic years** admin tab. Class migration targets a chosen year (default: current). No automatic copying of fee plans in this plan.                                          |
| 6   | **Class scope**          | "Active classes" everywhere in the app means **active AND in the current year**. A class created early for next year is invisible until that year is made current. Year-end order: create year → migrate classes into it → make it current on 1 Sep. |
| 7   | **Past years**           | **Admins only** browse previous years (classes, attendance, finance). Teachers stay on the current year and their own active classes.                                                                                                                |
| 8   | **Format**               | Year code is `YYYY-YY` (e.g. `2026-27`), 1 Sep – 31 Aug by default, dates editable, inclusive `end_date`. Existing `2025/26` values are normalised during backfill.                                                                                  |

---

## 1. Repo realities

| Fact (verified)                                                                                                                                                                                                                                 | Consequence                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classes.academic_year TEXT NOT NULL DEFAULT '2025-26'`; `fee_plans.academic_year TEXT`; data holds both `2025/26` and `2025-26`.                                                                                                               | Backfill normalises with `replace('/', '-')`, inserts one `academic_years` row per distinct value, then drops the text columns.                                                       |
| There is **no** unique index on class name + year, although `migrate_class` catches `unique_violation` with a "name already exists" message.                                                                                                    | Add `UNIQUE (name, academic_year_id)` on `classes` so that message becomes true. Backfill must first check for duplicates and raise with the offending names.                         |
| `src/lib/fees.ts` derives 1 Sep–31 Aug, instalment due dates and payment attribution from the year **string**.                                                                                                                                  | Year dates come from the table; instalment months stay relative to the calendar year of `start_date`. Payment attribution uses the payment's own `academic_year_id`, not its date.    |
| `student_fee_accounts.student_id` is UNIQUE; `student_payments` has no year; payments are delete-only (no edit).                                                                                                                                | Both gain `academic_year_id`. Account unique becomes `(student_id, academic_year_id)`. A payment recorded against the wrong year is deleted and re-added (matches the existing rule). |
| `save_fee_plan` and `migrate_class` SQL functions take `p_academic_year TEXT`.                                                                                                                                                                  | Both are redefined with `p_academic_year_id UUID` (drop old signatures first).                                                                                                        |
| `academicYear` zod schema validates the `YYYY-YY` string; class/fee forms use a text input.                                                                                                                                                     | Forms switch to a `<select>` of years; the class/fee-plan schemas take `academic_year_id: uuid`. The string regex moves to the academic-years form only.                              |
| `getAllClasses` (active only) feeds 10 pages: attendance, timetables, lesson-plans/new, staff-attendance, dashboard, students/[id]/edit, register (public), registrations/[id], reports, class-migration. `getClassesByTeacher` is active only. | Both add `academic_year_id = current`. Consumers are unchanged (decision 6). `getAllClassesIncludingInactive` is replaced by `getClassesByAcademicYear(yearId)`.                      |
| `src/types/database.ts` is generated (`/gentypes`, local). `supabase/schema.sql` is kept in sync by hand.                                                                                                                                       | Migration + schema.sql + gentypes in the same PR.                                                                                                                                     |
| `/admin` and `/finance` use `?tab=` tab bars; pages read filters from `searchParams`.                                                                                                                                                           | New **Academic years** tab on `/admin`. Year selectors use a `?year=<id>` search param (absent = current), never a cookie.                                                            |
| `supabase/seed.sql` seeds classes with `academic_year = '2025-26'`; today is in 2026-27, so seeded classes would become "last year" and vanish from every current-year list. `e2e/fixtures/seed.ts` references them by id.                      | Seed inserts two years — the one containing `CURRENT_DATE` (marked current) and the one before — and puts the three classes in the **current** one. `SEED_IDS.academicYears` added.   |
| `src/security.spec.ts`: every `'use server'` file awaits `auth()`; no `@/db` in client components.                                                                                                                                              | Followed by every new action/component.                                                                                                                                               |
| `canAccessAdminTasks` = admin; `canManageFinance` = admin.                                                                                                                                                                                      | Academic-year management and past-year browsing use these; no new permission.                                                                                                         |

---

## 2. Schema (`supabase/migrations/20260915120000_academic_years.sql`)

```text
CREATE EXTENSION IF NOT EXISTS btree_gist;

academic_years
  id           uuid PK DEFAULT gen_random_uuid()
  code         text NOT NULL UNIQUE  CHECK (code ~ '^\d{4}-\d{2}$')
  start_date   date NOT NULL
  end_date     date NOT NULL         CHECK (end_date > start_date)          -- inclusive
  is_current   boolean NOT NULL DEFAULT false
  created_at, updated_at (set_updated_at trigger)
  UNIQUE INDEX academic_years_one_current ON academic_years (is_current) WHERE is_current
  EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)      -- no overlaps
  RLS enabled; GRANT ALL TO service_role (same as finance tables)

classes               + academic_year_id uuid NOT NULL → academic_years ON DELETE RESTRICT
                      + UNIQUE (name, academic_year_id); index on academic_year_id
                      − academic_year text (and its DEFAULT)
fee_plans             + academic_year_id uuid NOT NULL → academic_years ON DELETE RESTRICT
                      − academic_year text; UNIQUE (name, academic_year) → UNIQUE (name, academic_year_id); index on academic_year_id
student_fee_accounts  + academic_year_id uuid NOT NULL → academic_years ON DELETE RESTRICT
                      + settled boolean NOT NULL DEFAULT false, settled_note text
                      − UNIQUE (student_id); + UNIQUE (student_id, academic_year_id)
student_payments      + academic_year_id uuid NOT NULL → academic_years ON DELETE RESTRICT; index on it
```

Backfill, in this order, inside the migration:

1. Insert a row per distinct normalised year found in `classes` and `fee_plans`, with `start_date = 1 Sep <yyyy>`, `end_date = 31 Aug <yyyy+1>`. Also ensure `2025-26` and `2026-27` exist. Mark the row containing `(now() AT TIME ZONE 'Europe/London')::date` as current; if none, the latest.
2. Raise if two classes share a name within one normalised year (list them); otherwise set `classes.academic_year_id` and `fee_plans.academic_year_id` from the text, then drop the text columns and add the unique constraints.
3. `student_payments.academic_year_id` = the year whose range contains `payment_date`, else the current year.
4. `student_fee_accounts.academic_year_id` = the year of `fee_plan_override_id` if set, else the current year.
5. Raise if any account's override plan is in a different year from the account.

Functions (drop old signatures first):

- `save_fee_plan(p_id, p_name, p_academic_year_id, …, p_class_ids)`: same body; additionally raise if any class in `p_class_ids` is not in `p_academic_year_id` (belt and braces for the app validation).
- `migrate_class(p_source_class_id, p_name, p_year_group, p_room_number, p_academic_year_id, p_teacher_id)`: new class gets the id; raise if the target year's `start_date` is not after the source class's year `start_date`. (The register-history plan later adds `p_graduating_student_ids` and dated enrolment rows.)
- New `set_current_academic_year(p_id uuid)`: `UPDATE academic_years SET is_current = (id = p_id)` in one statement (the partial unique index is satisfied because the statement is atomic).
- `approve_registration`: unchanged (inserts into a chosen class).
- Update `supabase/schema.sql` to match; run `/gentypes`.

---

## 3. Data layer (`src/db/`)

### `academic-years.ts` (new)

- `getAcademicYears()` — ordered by `start_date` desc; `unstable_cache`, tag `academic-years`.
- `getCurrentAcademicYear()` — throws `Error('No current academic year is set')`; every page that needs it lets the error surface (there is always one after the migration; the admin tab prevents unsetting).
- `getAcademicYearById(id)`, `getAcademicYearForDate(date)` (pure lookup over `getAcademicYears()`, in `src/lib/academicYears.ts` so the client payment form can reuse it).
- `createAcademicYear({ code, start_date, end_date })`, `updateAcademicYear(id, { start_date, end_date })` (code immutable once created), `setCurrentAcademicYear(id)` (RPC). Writers `updateTag('academic-years')`, `updateTag('classes')`, `updateTag('student-fees')`.
- Export from `index.ts`.

### Classes (`classes.ts`)

- `CLASS_SELECT` embeds `academic_year:academic_years(id, code, start_date, end_date)`. DB functions return `academic_year_id` and `academic_year: string` (the code) so display components keep their current prop shape; forms use `academic_year_id`.
- `getAllClasses()` → active AND `academic_year_id = current` (looks the current year up first; cache key includes the year id). `getClassesByTeacher(teacherId)` likewise.
- `getClassesByAcademicYear(yearId)` → all classes of that year, active and inactive, ordered by `year_group`. Replaces `getAllClassesIncludingInactive` (delete it and its consumers' usage: `classes/page.tsx`).
- `createClass`/`updateClass` take `academic_year_id`. `migrateClass` passes `p_academic_year_id`.
- `students.ts` `STUDENT_SELECT` nested embed: `student_classes(class:classes(id, name, year_group, academic_year:academic_years(code)))`; map to the existing `academic_year: string` shape in the one place it is read (`StudentDetailsModal`, `StudentsTable`).

### Fee plans (`fee-plans.ts`)

- Embed the year; `getFeePlans(yearId?)` (all years when omitted, used by the override select's "other years" guard and by prior-year balances); `saveFeePlan` passes `p_academic_year_id`.
- `FeePlanWithClasses.academic_year` becomes `{ id, code, start_date, end_date }`.

### Student fees (`student-fees.ts`)

- `getStudentFeeList(yearId)`: students = all (active filter handled by the register-history plan's leaver toggle; until then keep `active = true`); classes = the student's `student_classes` rows whose class has `academic_year_id = yearId` (no `active` filter — last year's classes are what last year's fees resolve from); account = the row for that year or `null`; payments = rows with that year.
- `getStudentFeeDetail(studentId, yearId)`: same shape for one student, payments with recorder.
- `getStudentFeeYears(studentId)`: for each year (desc) the student has a class, an account or a payment: `{ year, classes, account, payments }`. Feeds the detail page's "Previous years" strip and prior-year balances.
- `getPriorYearBalances(yearId)`: for every year with `start_date <` the selected year's, and every student, compute the year's summary and sum `owed = max(total − paid, 0)` **only** where `total` is known (class/override plan with a payment plan, or custom with an agreed total) **and** the account is not `settled`. Returns `Record<studentId, number>`. Runs over the same three tables as the list, so one extra round of queries, cached with the list's tags.
- `upsertStudentFeeAccount(studentId, yearId, input)` — `input` gains `settled`, `settled_note`. `addStudentPayment(studentId, { …, academic_year_id })`.

### Pure logic

- `src/lib/fees.ts`: `FeePlanAmounts.academic_year: string` → `academic_year: { code: string; start_date: string; end_date: string }`. `academicYearRange`/`academicYearStart` read the dates. `dueDates` uses `Number(start_date.slice(0, 4))`. **Delete** `paymentsInAcademicYear` (payments arrive pre-filtered). `normaliseAcademicYear` moves to `src/lib/academicYears.ts`, used only by the admin form and the backfill test.
- `src/lib/academicYears.ts` (new): `normaliseAcademicYear`, `nextAcademicYear(code)` → `{ code, start_date, end_date }`, `academicYearForDate(years, date)`.
- `src/lib/schemas.ts`: `createClassSchema`/`updateClassSchema`/`migrateClassSchema` → `academic_year_id: uuid`; `feePlanSchema` → `academic_year_id: uuid`; new `academicYearSchema` (`code` regex, `start_date`, `end_date`, refine `end_date > start_date`); `studentFeeAccountSchema` gains `academic_year_id: uuid`, `settled: checkbox`, `settled_note: optionalLongText`; `paymentSchema` gains `academic_year_id: uuid`.
- Override rule: the override plan must belong to the account's year. Enforced in the action (message "Choose a fee plan from <year>") and the select only lists that year's plans.
- `summariseStudentFees` is unchanged apart from the type; `buildStudentFeeRows` gains `priorOwed: number`.

---

## 4. UI

### Admin › Academic years (`src/app/admin/_tabs/academic-years/`)

- Table: code, start, end, **Current** badge, class count, fee-plan count. Ordered newest first.
- "Add year" form (`AcademicYearForm`, client): pre-filled with `nextAcademicYear(latest.code)`; code, start, end. Server action `createAcademicYearAction` → zod → `createAcademicYear` → audit `entity: 'academic_year'` → `redirect('/admin?tab=academic-years')`.
- Edit dates: same form in edit mode, code read-only. `updateAcademicYearAction`.
- "Make current" button with `confirm()` → `setCurrentAcademicYearAction` (audit `action: 'update'`, details `{ previous, current }`). Disabled on the current row.
- No delete (FK RESTRICT; not needed).
- Empty/no-current state is impossible after the migration; the tab shows a warning banner if `is_current` is somehow unset.

### Classes (`src/app/classes/`)

- Admin: `YearSelector` (server-rendered `<select>` that navigates with `?year=`), default current; list from `getClassesByAcademicYear`. Inactive badge kept. Non-admin: unchanged (their active current-year classes).
- New/edit forms: year `<select>` (options from `getAcademicYears()`), default current. Class detail shows the year code.

### Class migration (`src/app/admin/_tabs/class-migration/`)

- Target year `<select>`, default current. Source class list = classes of the year **before** the target (`getClassesByAcademicYear(previous.id)`, active only). Note under the form: "Create the new academic year first. After migrating, link that year's fee plans to the new class in Finance, then make the year current." Audit details gain `academic_year_id`.

### Attendance (`src/app/attendance/page.tsx`)

- Admin: `YearSelector` beside the class selector; classes from `getClassesByAcademicYear`. When the selected year is not current, the date defaults to the year's `end_date` (or today if within the year). Teachers: unchanged.

### Finance

- **Fee plans tab**: year filter (`?year=`), default current. Form: year `<select>`; class picker shows classes of the chosen year (client-side filter on `academic_year_id`).
- **Students tab**: `YearSelector`, default current. Column **Owed (prev. years)**, blank when 0. Status filter gains `owes_prior`. Rows via `buildStudentFeeRows(students, plans, today, priorOwed)`.
- **Student detail** (`/finance/students/[id]?year=`): year selector; that year's plan, account form (now with **Settled** checkbox + note, shown only for non-current years or when already settled), due/paid/status, payments. "Previous years" strip from `getStudentFeeYears`: code, total, paid, balance, "Settled" badge, link to switch year. Payment form gains `academic_year_id` `<select>` (options passed from the page; default = `academicYearForDate(years, payment_date)` recomputed when the date changes, else current).
- **Public registration** (`src/app/register`) and **registration review**: already use `getAllClasses` → current year by decision 6. No change.

---

## 5. Tests (per project rules)

- Vitest (co-located `.spec.ts(x)`):
  - `src/db/academic-years.spec.ts`; updated `classes.spec.ts` (current-year filter, by-year), `fee-plans.spec.ts`, `student-fees.spec.ts` (per-year list/detail, `getStudentFeeYears`, `getPriorYearBalances` incl. settled and unknown-total exclusions).
  - `src/lib/fees.spec.ts` (dates from the year row, due dates from `start_date`, `paymentsInAcademicYear` removed), `src/lib/academicYears.spec.ts`, `schemas.spec.ts` (new schemas, year-id requireds).
  - Admin tab, `AcademicYearForm`, actions (`await auth()`, permission redirect, audit). `YearSelector`.
  - Classes page year selector and forms; migration tab/form/action (target year, previous-year sources).
  - Finance tabs and detail (year switching, owed column/filter, previous-years strip, settled handling, payment year default, override-year validation).
  - Attendance page selector for admins; unchanged behaviour for teachers.
- Playwright (`e2e/tests/`):
  - `admin/academic-years.e2e.ts`: add next year → appears in list; make current → new class form defaults to it and the old year's classes disappear from the attendance selector; switch back in cleanup.
  - `finance/fees-by-year.e2e.ts`: student with a plan in the previous year and no payments shows "Owed (prev. years)"; recording a payment against the previous year clears it and does not count towards the current year; marking the previous year settled clears it too.
  - `e2e/fixtures/seed.ts`: `SEED_IDS.academicYears.{current, previous}`; helpers `setCurrentAcademicYear(id)` for cleanup.

---

## 6. Verification

- `supabase db reset` locally, then check: every class/fee plan/account/payment has a year; exactly one current year; overlapping year and second-current inserts are rejected; duplicate class name within a year is rejected.
- `npm run fix:all`, then `npm run pipeline:check`.
- Deployment: run before the register-history migration and before `hshb-pupil-import-2026-27/out/update.sql`; change that script's `JOIN classes c ON c.name = … AND c.academic_year = '2026-27'` to join `academic_years ay ON ay.id = c.academic_year_id AND ay.code = '2026-27'`. Confirm production has no duplicate class names within a year before running (step 2 raises otherwise).

---

## 7. Out of scope (follow-ups)

- Copying fee plans from one year to the next.
- Sibling discount (`discount_percent` on the per-year fee account is the natural home).
- Automatic year rollover on a date.
- Teachers browsing their own past-year classes.
