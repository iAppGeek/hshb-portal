# Academic Years — one list every year-bound record hangs off (hshb-portal)

**Goal:** Make the academic year a first-class record instead of free text, and link classes, fee plans, fee accounts and payments to it. Admins can then look back at any year and see its classes, class lists, registers and each student's fee position, including balances still owed from earlier years. Finance becomes a per-year view with one year selector; staff payroll and compliance move out of Finance into a new **HR** section.

This document describes what is implemented on `feat/academic-years` (PR #31). It is the basis for `~/.claude/plans/review-the-database-structure-rustling-owl.md` (register history & leavers), which assumes it is already implemented.

---

## 0. Decisions (as implemented)

| #   | Decision                 | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Source of truth**      | New `academic_years` table. At most one row is **current** (the migration and seed always set one). Classes, fee plans, fee accounts and payments reference it by id; the text column on classes and fee plans is dropped.                                                                                                                                                                                                         |
| 2   | **What links to a year** | **Directly:** classes, fee plans, student fee accounts, student payments. **Via class:** attendance, lesson plans, timetable slots, student class links. **Via date:** incidents. Staff records are not year-bound.                                                                                                                                                                                                                |
| 3   | **Fees**                 | One fee plan per student per year (unchanged). Fee account is **one row per student per year**. Each payment carries the year it pays for; the form defaults it from the payment date and it can be changed.                                                                                                                                                                                                                       |
| 4   | **Outstanding balance**  | Finance › Students shows the selected year's status **and** an **Owed (prev. years)** column with a matching filter. A per-year **settled** flag + note on the fee account, available in every year, removes that year from the owed total. A fee plan's active flag never affects fees: an inactive plan still applies to its classes and still counts toward what is owed, so deactivating last year's plans never hides a debt. |
| 5   | **Year rollover**        | Manual. Admin › **Academic Years** tab adds a year, edits its dates and makes one current. Class migration picks a target year (default: current).                                                                                                                                                                                                                                                                                 |
| 6   | **Class scope**          | `getAllClasses` and `getClassesByTeacher` return **active classes in the current year**. A class created early for next year stays out of those lists until that year is made current.                                                                                                                                                                                                                                             |
| 7   | **Past years**           | **Admins only.** On Classes and Attendance, admins get a year selector; headteachers, secretaries and teachers stay on the current year and any `?year` is ignored. Attendance lists active classes for the current year and every class for another year, and registers outside the current year are read-only. Finance (admin only) is per year.                                                                                 |
| 8   | **Format**               | Year code `YYYY-YY` (e.g. `2026-27`), 1 Sep – 31 Aug by default, dates editable, inclusive `end_date`.                                                                                                                                                                                                                                                                                                                             |
| 9   | **Finance navigation**   | Finance has two tabs, **Students** (default) and **Fee Plans**, under one year selector in the page header. Everything on the page follows the selected year; the current year is only the default when no year is chosen. The year is carried through tab links, student links, the add-fee-plan link and the student page's back link. An unknown or missing year falls back to the current year.                                |
| 10  | **HR**                   | Staff payroll and compliance move from Finance to a new **HR** sidebar item at `/hr` and `/hr/staff/[id]`. New `canManageHr` permission, admin only, so entitlements are unchanged. Old `/finance?tab=staff` and `/finance/staff/[id]` URLs are not redirected.                                                                                                                                                                    |
| 11  | **Class year is fixed**  | A class's academic year cannot change after it is created. The edit form shows it read-only, `updateClassSchema` drops it, `updateClass` cannot take it, and a database trigger rejects the change. Class migration creates a new class instead.                                                                                                                                                                                   |
| 12  | **Inactive fee plans**   | `fee_plans.active` only hides a plan from the student override dropdown. Resolution through classes, the student fee page and prior-year balances ignore it.                                                                                                                                                                                                                                                                       |

---

## 1. Repo realities

| Fact (verified)                                                                                                                           | Consequence                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classes.academic_year TEXT NOT NULL DEFAULT '2025-26'`; `fee_plans.academic_year TEXT`; data holds both `2025/26` and `2025-26`.         | Backfill normalises with `replace('/', '-')`, inserts one `academic_years` row per distinct value, then drops the text columns.                           |
| There was no unique index on class name + year, although `migrate_class` catches `unique_violation` with a "name already exists" message. | `UNIQUE (name, academic_year_id)` on `classes`. The migration first raises with the offending names if duplicates exist.                                  |
| `src/lib/fees.ts` derived 1 Sep–31 Aug, due dates and payment attribution from the year **string**.                                       | Due dates come from the year row's `start_date`. Payments are filtered by `academic_year_id` in the data layer, not by date.                              |
| `student_fee_accounts.student_id` was UNIQUE; `student_payments` had no year; payments are delete-only.                                   | Both gain `academic_year_id`. Account unique is `(student_id, academic_year_id)`. A payment against the wrong year is deleted and re-added.               |
| `save_fee_plan` and `migrate_class` took `p_academic_year TEXT`.                                                                          | Both redefined with `p_academic_year_id UUID` (old signatures dropped).                                                                                   |
| `src/types/database.ts` is generated; `supabase/schema.sql` is kept in sync by hand.                                                      | Migration, `schema.sql` and regenerated types are in the same PR.                                                                                         |
| `/admin` and `/finance` use `?tab=` tab bars; pages read filters from `searchParams` (a Promise in Next 16).                              | Year selectors use `?year=<id>`; class migration uses `?targetYearId=<id>`.                                                                               |
| `supabase/seed.sql` put classes in `2025-26`; today is in 2026-27.                                                                        | Seed replaces the backfilled years with fixed ids: `2026-27` current, `2025-26` previous. Seeded classes, fee plan, account and payment are in `2026-27`. |
| `src/security.spec.ts`: every `'use server'` file awaits `auth()`; no `@/db` in client components.                                        | Followed by every new action and component.                                                                                                               |
| The staff payroll tab lived under Finance, so Finance mixed a year-bound area (fees) with a non-year area (payroll, DBS, right to work).  | Payroll and compliance move to `/hr`, gated by `canManageHr`; Finance is fully year-bound.                                                                |

---

## 2. Schema (`supabase/migrations/20260914120000_academic_years.sql`)

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
  RLS enabled; GRANT ALL TO service_role

classes               + academic_year_id uuid NOT NULL → academic_years ON DELETE RESTRICT
                      + UNIQUE (name, academic_year_id); index on academic_year_id
                      − academic_year text
fee_plans             + academic_year_id uuid NOT NULL → academic_years ON DELETE RESTRICT
                      − academic_year text; UNIQUE (name, academic_year) → UNIQUE (name, academic_year_id); index on academic_year_id
student_fee_accounts  + academic_year_id uuid NOT NULL → academic_years ON DELETE RESTRICT; index on it
                      + settled boolean NOT NULL DEFAULT false, settled_note text
                      − UNIQUE (student_id); + UNIQUE (student_id, academic_year_id)
student_payments      + academic_year_id uuid NOT NULL → academic_years ON DELETE RESTRICT; index on it
```

Backfill, in order:

1. Insert a year per distinct normalised value in `classes` and `fee_plans`, plus `2025-26` and `2026-27`, each 1 Sep – 31 Aug. Mark the year containing today (Europe/London) current; if none does, the latest.
2. Raise if two classes share a name within one normalised year. Set `classes.academic_year_id` and `fee_plans.academic_year_id` from the text, add constraints, drop the text columns.
3. `student_payments.academic_year_id` = the year whose range contains `payment_date`, else the current year.
4. `student_fee_accounts.academic_year_id` = the year of `fee_plan_override_id` if set, else the current year.
5. Raise if any account's override plan is in a different year from the account.

Follow-up migration `supabase/migrations/20260914130000_lock_class_academic_year.sql`: trigger function `prevent_class_academic_year_change` and `BEFORE UPDATE OF academic_year_id` trigger `classes_academic_year_immutable` on `classes`, raising "A class's academic year cannot be changed". It is a separate file because `20260914120000` had already run on production; both have now run there.

Functions:

- `save_fee_plan(p_id, p_name, p_academic_year_id, …, p_class_ids)`: raises if any class in `p_class_ids` is not in `p_academic_year_id`.
- `migrate_class(p_source_class_id, p_name, p_year_group, p_room_number, p_academic_year_id, p_teacher_id)`: raises if the target year is not found or does not start after the source class's year. Copies every `student_classes` row of the source class into the new class and deactivates the source class (unchanged behaviour; the register-history plan changes this).
- `set_current_academic_year(p_id)`: raises if not found; `UPDATE academic_years SET is_current = (id = p_id)` in one statement.
- `approve_registration`: unchanged.

---

## 3. Data layer

### `src/db/academic-years.ts` (new)

- `getAcademicYears()` — ordered by `start_date` desc; `unstable_cache`, tag `academic-years`.
- `getCurrentAcademicYear()` (throws `No current academic year is set`), `getAcademicYearById(id)`, `getAcademicYearForDate(date)` — all derived from the cached list.
- `createAcademicYear`, `updateAcademicYear` (dates only), `setCurrentAcademicYear` (RPC). Writers invalidate `academic-years`, `classes`, `student-fees`.
- `revalidateAllCaches` (`src/app/actions.ts`) also invalidates `academic-years`.

### Classes (`src/db/classes.ts`)

- `CLASS_SELECT` embeds `academic_year:academic_years(id, code, start_date, end_date)`; `withYearCode` flattens it to `academic_year: string | null` so display components keep their prop shape. Rows also carry `academic_year_id`.
- `getAllClasses()` and `getClassesByTeacher(teacherId)` look up the current year and call cached year-keyed queries (active classes only).
- `getClassesByAcademicYear(yearId)` returns every class in a year, active and inactive. `getAllClassesIncludingInactive` is removed.
- `getClassById` and `getClassWithStudents` are flattened the same way. `createClass` and `migrateClass` take `academic_year_id`; `updateClass` does not accept it.

### Students (`src/db/students.ts`)

- `STUDENT_SELECT` embeds `academic_year:academic_years(code)` under each class; `withClassYearCodes` flattens it for `getStudentsByTeacher`, `getAllStudents` and `getStudentsByClass`.

### Fee plans (`src/db/fee-plans.ts`)

- `FEE_PLAN_SELECT` embeds the year; `FeePlanWithClasses.academic_year` is `{ id, code, start_date, end_date }`.
- `getFeePlans(yearId?)` — one year, or all years when omitted; ordered by name. `saveFeePlan` passes `p_academic_year_id`.

### Student fees (`src/db/student-fees.ts`)

- `getStudentFeeList(yearId)`: active students; classes = their class links whose class is in `yearId` (inner join, no class `active` filter); that year's account; that year's payments (paged past the 1000-row cap).
- `getStudentFeeDetail(studentId, yearId)`: the same for one student, payments with recorder.
- `getStudentFeeYears(studentId)`: every year (newest first) where the student has a class, an account or a payment.
- `getPriorYearBalances(yearId)`: for each year starting before `yearId`, reuses `getStudentFeeList` and `getFeePlans`, resolves the plan (override, else every class plan regardless of status), and adds `max(total − paid, 0)` where `total` is known and the account is not settled. `today` is that year's `end_date`.
- `upsertStudentFeeAccount(studentId, yearId, input)`; `addStudentPayment(studentId, { …, academic_year_id })`.

### Pure logic and validation

- `src/lib/fees.ts`: `FeePlanAmounts.academic_year` is `{ code, start_date, end_date }`; `dueDates(plan, startDate)`. `normaliseAcademicYear`, `academicYearStart`, `academicYearRange` and `paymentsInAcademicYear` are removed from this file.
- `src/app/finance/_lib/studentFeeSummary.ts`: `summariseStudentFees` resolves an override first, else every class plan regardless of its active flag.
- `src/lib/academicYears.ts` (new): `normaliseAcademicYear`, `nextAcademicYear(code)`, `academicYearForDate(years, date)`, `resolveYearId(years, requestedId, currentId)`.
- `src/lib/schemas.ts`: create-class, migrate-class and fee-plan schemas take `academic_year_id: uuid`; `updateClassSchema` omits it; new `academicYearSchema` and `academicYearDatesSchema`; fee account schema gains `academic_year_id`, `settled`, `settled_note`; payment schema gains `academic_year_id`.
- `src/lib/permissions.ts`: `canManageFinance` (student fees and fee plans) and new `canManageHr` (staff payroll and compliance), both admin only.
- `src/proxy.ts`: `/finance` and `/finance/*` require `canManageFinance`; `/hr` and `/hr/*` require `canManageHr`; others redirect to `/dashboard`.

---

## 4. UI

### Admin › Academic Years (`/admin?tab=academic-years`, second tab after Class Migration)

- `AcademicYearsTab`: table of years with dates, **Current** badge, class count and fee-plan count; inline edit of dates (code read-only); **Make current** button with `confirm()`. A red banner shows if no year is current.
- "Add year" form pre-filled with `nextAcademicYear(latest.code)`.
- Actions (`actions.ts`): `createAcademicYearAction`, `updateAcademicYearAction`, `setCurrentAcademicYearAction`. Each awaits `auth()`, checks `canAccessAdminTasks`, validates with zod, writes an audit entry (`entity: 'academic_year'`). Create and update redirect to the tab; make-current revalidates `/admin`, `/classes`, `/attendance`, `/finance` and logs `{ previous, current }`.
- No delete.

### Shared `YearSelector` (`src/app/_components/YearSelector.tsx`)

- Client `<select>` that navigates to `basePath?<extraParams>&year=<id>`.

### Classes (`src/app/classes/`)

- List: admins get `YearSelector` and `getClassesByAcademicYear(resolveYearId(years, ?year, current))`. Headteachers and secretaries get `getClassesByAcademicYear(current)` with no selector; `?year` is ignored. Teachers keep `getClassesByTeacher`.
- New form: year `<select>`, defaulting to the current year. Edit form: the year is shown as read-only text with "A class's academic year can't be changed after it is created." and is not posted.

### Class migration (`src/app/admin/_tabs/class-migration/`)

- Target year `<select>` (`?targetYearId=`, default current). Source list = active classes of the year before the target. The free-text academic year field is removed; the target year is posted as `academic_year_id`.
- Guidance under the target year: create the new academic year first; after migrating, link that year's fee plans to the new class in Finance, then make the year current.

### Attendance (`src/app/attendance/`)

- Admins: `YearSelector` (`resolveYearId`, default current). The current year lists `getAllClasses()` (active, current year); another year lists `getClassesByAcademicYear(year)`, including inactive classes, because a completed class is deactivated by migration. For another year the date defaults to today if it falls inside that year, otherwise the year's `end_date`. `AttendanceFilters` keeps `year` when changing class or date.
- Headteachers and secretaries: `getAllClasses()`, no selector, `?year` ignored. Teachers: `getClassesByTeacher`, unchanged.
- A `classId` that is not in the listed classes falls back to the first listed class.
- **Read-only past registers:** the page passes `archived` to `AttendanceRegister` and `AttendanceForm` when the selected year is not current; the form disables the status buttons and shows "This register is from a past academic year and is read-only." instead of Save. `saveAttendanceAction` loads the class and the current year and rejects a missing class or one outside the current year ("Registers can only be saved for classes in the current academic year."), then reuses the loaded class name for the push notification.

### Finance (`/finance`, admin only)

- **Page header**: title, description and one `YearSelector` (`extraParams: { tab }`). `yearId = resolveYearId(years, ?year, current)`.
- **Tabs** (`FinanceTabBar`): Students (default) and Fee Plans; links keep `year`.
- **Students tab**: `getStudentFeeList`, `getFeePlans`, `getPriorYearBalances` for the year. `StudentFeesTable` adds **Owed (prev. years)** and the "Owes from previous years" filter; **Manage** links to `/finance/students/[id]?year=<id>`.
- **Fee Plans tab**: that year's plans and class names; **Add fee plan** links to `/finance/fee-plans/new?year=<id>`.
- **Fee plan new/edit pages**: year `<select>` (new defaults to `?year`, else current); classes for every year are loaded and `FeePlanForm` shows those of the selected year. Actions validate against that year's classes and plans.
- **Student detail** (`/finance/students/[id]?year=`): `resolveYearId`; its own `YearSelector`; back link to `/finance?tab=students&year=<id>`. Fee account form posts `academic_year_id`; override options are that year's active plans plus the current override; **Settled** checkbox and note show for every year. **Other years** table lists every other year with history (total, paid, balance, Settled badge, link to that year). Payment form adds **Pays for** (`academic_year_id`), defaulting to the year containing the payment date, else the selected year.

### HR (`/hr`, admin only)

- Sidebar item **HR** (`IdentificationIcon`), filtered by `canManageHr`, placed before Finance.
- `/hr` (`src/app/hr/page.tsx`): heading and `StaffPayrollList` (moved from the Finance staff tab, unchanged behaviour).
- `/hr/staff/[id]`: payroll and compliance form, moved from `/finance/staff/[id]`. The action checks `canManageHr`, revalidates `/hr` and redirects to `/hr`; back and cancel links go to `/hr`. `SecretField` moves to `src/app/hr/_components/`.
- Cache tag `staff-payroll`, audit entity `staff_payroll` and tables are unchanged.

---

## 5. Tests

- **Vitest** (co-located specs):
  - `src/db`: `academic-years.spec.ts` (new); `classes`, `fee-plans`, `student-fees`, `students` specs updated for year-keyed APIs, prior-year balances and year-code flattening.
  - `src/lib`: `academicYears.spec.ts` (incl. `resolveYearId`), `fees.spec.ts`, `schemas.spec.ts`, `permissions.spec.ts` (incl. `canManageHr`).
  - `src/proxy.spec.ts`: `/finance` and `/hr` gating, nested pages, `/financeX` and `/hrX` not gated.
  - Admin: academic-years tab, table, form, make-current button, actions; admin page; class-migration tab, form, actions.
  - `ClassForm` (year selectable on create, read-only on edit); class edit action and `updateClassSchema` never pass an academic year; fee summary and prior-year balances count inactive plans; settled fields show in every year; the payment year falls back to the selected year.
  - Classes page (admin-only year selector, unknown-year fallback, headteacher and secretary pinned to the current year), new/edit pages and actions; attendance page (admin-only year selector, active classes for the current year, all classes and `archived` for another year, unknown-year fallback, unlisted `classId` fallback), register and form (`archived` disables marking and Save), save action (rejects a missing class or a class outside the current year).
  - Finance: page (default tab, requested year, unknown-year fallback, no staff tab), tab bar (year in links), students tab and table (year in links, owed column and filter), fee plans tab (year in add link), fee-plan form/pages/actions, student detail page (per-year data, previous years, unknown-year fallback, back link) and forms.
  - HR: `hr/page.spec.tsx` (role gating), `StaffPayrollList`, staff page, form and action specs (moved).
  - `YearSelector`.
- **Playwright** (`e2e/`):
  - `fixtures/seed.ts`: `SEED_IDS.academicYears.{current, previous}`, `setCurrentAcademicYear(id)`, `deleteAcademicYearByCode(code)`.
  - `fixtures/loadWithFreshData.ts`: shared refresh-and-reload helper used by the finance and HR specs.
  - `tests/finance/finance.e2e.ts`: creates a far-future year per test; fee plan creation (add link carries the current year) and recording/deleting a payment.
  - `tests/hr/hr.e2e.ts`: creates a staff payroll record with masked bank details at `/hr`.
  - `tests/permissions/entitlements.e2e.ts`: `/hr` and `/hr/staff/[id]` admin only.
  - `tests/navigation/sidebar.e2e.ts`: HR nav item admin only.
  - `tests/classes/class-register.e2e.ts`, `edit-class.e2e.ts`: fixtures use the seeded current year.

---

## 6. Verification and deployment

- `supabase db reset` locally, then check: every class, fee plan, account and payment has a year; exactly one current year; overlapping years and a second current year are rejected; duplicate class names within a year are rejected.
- `npm run fix:all`, then `npm run pipeline:check`.
- Both `20260914120000_academic_years.sql` and `20260914130000_lock_class_academic_year.sql` have run on production. Production must run this branch: the app on `main` reads the dropped `academic_year` text columns.
- Post-migration checks on production:

  ```sql
  -- Active classes outside the current year: they no longer show in current-year lists
  SELECT c.name, ay.code
  FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id
  WHERE c.active AND NOT ay.is_current;

  -- Fee accounts outside the current year: moved there by their override plan
  SELECT sfa.student_id, ay.code
  FROM student_fee_accounts sfa JOIN academic_years ay ON ay.id = sfa.academic_year_id
  WHERE NOT ay.is_current;

  -- Payments counted toward a year other than the current one
  SELECT sp.student_id, sp.amount, sp.payment_date, ay.code
  FROM student_payments sp JOIN academic_years ay ON ay.id = sp.academic_year_id
  WHERE NOT ay.is_current;
  ```

- Run before the register-history migration and before `hshb-pupil-import-2026-27/out/update.sql`; change that script's `c.academic_year = '2026-27'` join to join `academic_years ay ON ay.id = c.academic_year_id AND ay.code = '2026-27'`.
- Bookmarks to `/finance?tab=staff` or `/finance/staff/[id]` stop working; use `/hr`.

---

## 7. Known gaps (not in this PR)

- The override plan's year is only constrained by the form's options; `saveStudentFeeAccountAction` does not reject an override from another year.
- Prior-year balances only include active students (leavers are added by the register-history plan).
- No dedicated Playwright spec yet for the Academic Years admin flow or for fees across years (payment against last year, settled year).
- The finance e2e year is chosen from 400 far-future slots per test; two parallel tests can collide on the overlap constraint.

---

## 8. Out of scope (follow-ups)

- Copying fee plans from one year to the next.
- Sibling discount (`discount_percent` on the per-year fee account is the natural home).
- Automatic year rollover on a date.
- Teachers browsing their own past-year classes.
