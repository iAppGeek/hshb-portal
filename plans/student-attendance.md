# Student Attendance — a student's figure, the worst attenders, and class session dates (hshb-portal)

**Goal:** Show each student's attendance on their details page (Phase 1), and list the students with the worst attendance on the Reports page for a month or date range (Phase 2). Both phases use one shared calculation: the days a student attended out of the days a register was taken for a class they were in. Phase 3 adds a **Class Session Dates** table to each class page, showing every school session date and whether that class's register was taken.

**Prerequisite:** PR #80 (`attendance_registers`) merged to `main` on 2026-10-10. Each phase gets its own branch from `main` and its own PR. Phase 2 starts after Phase 1 is merged, and Phase 3 after Phase 2.

**Before writing code:** read `AGENTS.md` (the Next.js guides under `node_modules/next/dist/docs/`, and the Drizzle rules) and follow the conventions in `CLAUDE.md`: explicit return types, `type` over `interface`, no `any`, a `.spec.ts(x)` next to every new function or component, `vi.mock`/`vi.fn` only, no TODO comments. Implement one phase per session and run §6 before opening its PR.

---

## 0. Decisions

| #   | Decision                   | Outcome                                                                                                                                                                                                                                                                          |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Late**                   | Counts as attended.                                                                                                                                                                                                                                                              |
| 2   | **Unmarked**               | A register taken with no mark for the student is a missed day: it counts as possible but not attended.                                                                                                                                                                           |
| 3   | **Reports class summary**  | Switches to the same rule: a class's possible attendance counts only the dates its register was taken. Untaken registers stop counting as absences (this replaces "decision 7" in `src/app/reports/page.tsx`).                                                                   |
| 4   | **Which class**            | Dated stays. A register counts for a student if they were enrolled in that class on that date (`start_date <= date < end_date`, or `end_date` is null) **or** have a mark on it — the same rule as `buildRegisterRoster`.                                                        |
| 5   | **Unit = a day**           | Combined across classes, one figure per **date**, so it can never exceed 100%. A date is possible if any qualifying register was taken that day. Its status is its best mark across the day's classes: present > late > absent > unmarked. Attended in any class means attended. |
| 6   | **Inactive classes**       | Their registers still count.                                                                                                                                                                                                                                                     |
| 7   | **Display**                | A whole-number percentage with the counts beside it: `92% (23/25)`. `—` when there are no possible days.                                                                                                                                                                         |
| 8   | **Student page list**      | Every possible day with its status (Present / Late / Absent / Not marked) and the class name(s), newest first, inside a native `<details>`.                                                                                                                                      |
| 9   | **Student page access**    | Everyone who can open the student page. Teachers are already limited to their own students.                                                                                                                                                                                      |
| 10  | **Student page year**      | Current academic year only, from its `start_date` to the earlier of its `end_date` and today. No year selector. The card is hidden when no year is current.                                                                                                                      |
| 11  | **Leavers (student page)** | The card shows for leavers, covering their days this year up to when they left.                                                                                                                                                                                                  |
| 12  | **Report modes**           | Worst attenders shows in **month** and **range** mode, not day mode.                                                                                                                                                                                                             |
| 13  | **Ranking**                | Lowest percentage first, then most days missed, then surname, then first name.                                                                                                                                                                                                   |
| 14  | **Minimum days**           | None. The tie-break on days missed ranks 0/5 above 0/1.                                                                                                                                                                                                                          |
| 15  | **100% excluded**          | Students at 100% never appear, so the list can be shorter than X.                                                                                                                                                                                                                |
| 16  | **Who is listed (report)** | Only students with a stay in an **active** class that overlaps the range (`staysOverlapping` + `classes.active`). Leaving doesn't matter in itself: a student who left mid-range still qualifies through the stay they had, and shows a `LeaverBadge`. No schema change.         |
| 17  | **X**                      | A number input, default 10, whole numbers from 1 up. Held in client state only, not in the URL, and resets to 10 on reload. An empty or invalid entry shows 10.                                                                                                                  |
| 18  | **Columns**                | Student (links to `/students/[id]`), Class(es), Attended (`23/25`), %, Late, Absent, Not marked. Absent + Not marked always equals the days missed.                                                                                                                              |
| 19  | **Placement and print**    | After the class summary in `PeriodReport`. The table prints; the X input has `print:hidden`.                                                                                                                                                                                     |
| 20  | **Export**                 | No CSV export.                                                                                                                                                                                                                                                                   |
| 21  | **Session dates: where**   | Class detail page `/classes/[id]`, a new **Class Session Dates** section at the end, after Enrolment history. Visible to everyone who can open the page; teachers only see their own classes.                                                                                    |
| 22  | **Session dates: which**   | The union of dates on which **any** class in this class's academic year took a register, up to today. A past year's class shows that year's dates.                                                                                                                               |
| 23  | **Session dates: status**  | **TAKEN** (green pill) when this class has a register row for the date, otherwise **NOT TAKEN** (amber pill).                                                                                                                                                                    |
| 24  | **Session dates: figure**  | On TAKEN dates: % = (present + late) / that day's roster (`buildRegisterRoster` rule: enrolled that day or marked), so unmarked counts as missed. Shown as `92% · 11 attended / 1 absent`. NOT TAKEN dates show `—`.                                                             |
| 25  | **Session dates: format**  | `Sat 5-Sept-26` (short weekday, day, short month, two-digit year, joined by hyphens; `Sep` or `Sept` are both fine, whatever `Intl` gives), newest first. Hidden when printing, like Enrolment history.                                                                          |

---

## 1. Repo realities

| Fact (verified)                                                                                                                                                                                 | Consequence                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attendance_registers` has one row per class per date (unique `(class_id, date)`). A row means the register was taken.                                                                          | Possible days come from register rows, not from attendance marks.                                                                                                                       |
| `summariseAttendance` (`src/lib/attendanceSummary.ts`) computes a class's `possible` over every school day in the range (any staff sign-in or any register), not only that class's taken dates. | Decision 3 changes that loop to that class's register dates. Only `PeriodReport` reads `possible`. Day mode's stats and the dashboard SQL do not, so they are unchanged.                |
| `students` has no leaving date. `markLeaver` (`src/db/students.ts`) sets `active = false` and `leaving_reason` and closes open stays on today's date.                                           | Decision 16 uses the stays, not a leaving date, so no column is added. `staysOverlapping(stay, start, end)` in `src/db/membership.ts` already expresses "a stay overlapping the range". |
| `getCurrentAcademicYear()` throws when no year is current.                                                                                                                                      | The student page uses `getAcademicYears()` and finds `is_current`, so a missing year hides the card instead of failing the page.                                                        |
| `src/security.spec.ts`: no `@/db` imports in client components.                                                                                                                                 | Row types the client table needs live in `src/lib/studentAttendance.ts`, not `src/db`.                                                                                                  |
| `membership.ts` has `enrolledOn(stay, date)` for a literal date.                                                                                                                                | The shared query needs the stay check against a column (`attendance_registers.date`), so it writes that join condition inline, the same comparison as `isEnrolledOn`.                   |

---

## 2. The shared calculation (Phase 1, reused in Phase 2)

### `src/lib/studentAttendance.ts` (pure, client-safe)

```ts
export type DayStatus = 'present' | 'late' | 'absent' | 'unmarked'

export type StudentAttendanceDay = {
  date: string
  status: DayStatus
  classNames: string[]
}

export type StudentAttendanceTotals = {
  studentId: string
  possible: number
  attended: number // present + late days
  late: number
  absent: number
  unmarked: number
}

export type WorstAttenderRow = StudentAttendanceTotals & {
  firstName: string
  lastName: string
  classNames: string[]
  leavingReason: string | null // set only when the student has left (active = false)
}

/** Whole-number percentage, or null when there were no possible days. */
export function attendancePercent(
  attended: number,
  possible: number,
): number | null

/** `92% (23/25)`, or `—` when there were no possible days. */
export function formatAttendance(attended: number, possible: number): string
```

### `src/db/attendance.ts`

Two private builders. Phases 2 and 3 reuse both, so write them once here.

- **`registerRoster(startDate, endDate, opts: { studentId?: string; classId?: string })`** returns `(class_id, date, student_id)` for every register in the range: who was on it. Build it with `union` from `drizzle-orm/pg-core`. The precedent is `onRegisterToday` in `src/db/dashboard.ts`, and `union` removes duplicates, so a student who is both enrolled and marked appears once. Apply the `studentId` / `classId` filter **inside both branches** so Postgres can use `student_classes_student_id_idx` and `attendance_student_id_idx`.
- **`studentDays(startDate, endDate, studentId?)`** returns a `$with` CTE over `registerRoster`, grouped to one row per student per day, which the public functions select from:

1. **sessions:** for each `attendance_registers` row in the range, the student ids on its roster. That is a `UNION` of:
   - `student_classes` stays covering the register's date (`sc.class_id = r.class_id AND sc.start_date <= r.date AND (sc.end_date IS NULL OR sc.end_date > r.date)`)
   - `attendance` marks with the same `(class_id, date)`.

   This is `registerRoster(startDate, endDate, { studentId })`.

2. Each session is left-joined to `attendance` for its mark, and joined to `classes` for the name.
3. Grouped by `(student_id, date)`:
   - `status` = `CASE WHEN bool_or(status = 'present') THEN 'present' WHEN bool_or(status = 'late') THEN 'late' WHEN bool_or(status = 'absent') THEN 'absent' ELSE 'unmarked' END`
   - `class_names` = `array_agg(DISTINCT classes.name ORDER BY classes.name)`

Public functions, exported from `src/db/index.ts`:

- `getStudentAttendanceDays(studentId, startDate, endDate): Promise<StudentAttendanceDay[]>` selects the CTE ordered by `date DESC`.
- `getStudentAttendanceTotals(studentId, startDate, endDate): Promise<StudentAttendanceTotals>` groups the CTE with `count(*)` and `count(*) FILTER (WHERE …)`. It returns zeros when there are no rows.

All counting stays in SQL. There are no JS `Map`s.

**Drizzle gotchas**

- postgres-js returns `count(*)` as a string. Use `count()` from `drizzle-orm`, or `sql<number>\`…\`.mapWith(Number)`, for every count.
- Type the `CASE` as `sql<DayStatus>` and `array_agg` as `sql<string[]>`.
- `date` columns come back as `YYYY-MM-DD` strings, so `<=` against `todayInSchoolTz()` works directly.

---

## 3. Phase 1 — the student details page

Branch `feat/student-attendance` (already created from `main` at `04149bb`, no upstream; push with `git push -u origin feat/student-attendance`).

1. Add `src/lib/studentAttendance.ts` and the two db functions (§2).
2. Add `src/app/students/[id]/_components/StudentAttendanceSection.tsx`, a server component taking `{ yearCode, totals, days }`:
   - `SectionCard` titled `Attendance · 2026-27`.
   - Headline: `formatAttendance(attended, possible)`, with a line under it: `n late · n absent · n not marked` (zero counts are left out).
   - `<details><summary>Show all days (25)</summary>` containing a list of each day: the formatted date (`formatCalendarDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })`), its class name(s), and a status pill, `rounded-full px-2.5 py-0.5 text-xs font-medium` plus: Present `bg-green-100 text-green-800`, Late `bg-amber-100 text-amber-800`, Absent `bg-red-100 text-red-800`, Not marked `bg-gray-100 text-gray-600` (the colours `AttendanceForm` and `ActiveBadge` already use).
   - No possible days: "No registers taken this year." and no `<details>`.
3. In `src/app/students/[id]/page.tsx`, after the teacher check and `getStudentById`:
   - Find the current year from `getAcademicYears()`.
   - If there is one, set `end = min(year.end_date, todayInSchoolTz())` and fetch the totals and days in `Promise.all`.
   - Render the card after **Classes**. Hide it when no year is current.

### Phase 1 tests

**Integration specs.** `src/db/attendance.int.spec.ts` already has `mark()` / `register()` helpers and uses `SEED` from `./test-db`. Write registers through `saveAttendance`, which also writes the `attendance_registers` row. Insert extra `student_classes` stays with `db.insert(studentClasses)`. Use dates no other `describe` in the file uses, and read the seeded enrolments in `supabase/seed.sql` before choosing students. To test a taken register with an unmarked student, save a register that marks a different student in the same class.

**Server component specs** follow `page.spec.tsx`: `render(await Component(props))`.

**E2E seeding.** E2E specs seed over SQL with `insertRow` from `e2e/fixtures` (see `e2e/tests/classes/register-history.e2e.ts`). That spec only inserts `attendance` rows. These features read `attendance_registers`, so **every seeded register must also insert its `attendance_registers` row** (`class_id`, `date`), and cleanup must delete those rows too.

- `src/lib/studentAttendance.spec.ts`: `attendancePercent` (0 possible → null; rounding of 2/3 → 67) and `formatAttendance`.
- `src/db/attendance.int.spec.ts`, new `describe` blocks for both functions:
  - present, late and absent marks
  - a taken register with no mark (counted as unmarked)
  - a register for a class the student was not in that day (excluded)
  - a mid-range class move (each class counts only within its stay)
  - a mark on a date after the stay ended (included)
  - two classes on one date: present + absent counts as one attended day, and absent + unmarked counts as one absent day, so the result is never above 100%
  - a register outside the range (excluded)
  - no registers (zeros)
- `StudentAttendanceSection.spec.tsx`:
  - the headline and counts line
  - the empty state
  - the `<details>` closed by default
  - a status pill per day
  - days newest first
  - multiple class names
- `src/app/students/[id]/page.spec.tsx`:
  - add `getAcademicYears`, `getStudentAttendanceTotals` and `getStudentAttendanceDays` to the `vi.mock('@/db')` factory
  - the card renders with the year code
  - the card is hidden with no current year
  - the db functions are called with the student id, the year start and `min(end, today)`
- `e2e/tests/students/student-attendance.e2e.ts`: seed a student in a class, take two registers (present, absent), open the student page and check `50% (1/2)`, then expand and check both days.

---

## 4. Phase 2 — worst attenders on Reports

Branch `feat/reports-worst-attenders` from `main` after Phase 1 merges.

No schema change.

### Data

`getWorstAttenders(startDate, endDate): Promise<WorstAttenderRow[]>` in `src/db/attendance.ts`:

- It groups `studentDays(startDate, endDate)` by student, the same counts as `getStudentAttendanceTotals`, plus `array_agg(DISTINCT class name)`.
- It joins `students` for the name and leaving reason, and keeps only students where `EXISTS` a `student_classes` stay joined to an active class with `staysOverlapping(studentClasses, startDate, endDate)` (decision 16).
- `HAVING attended < possible` (decision 15).
- `ORDER BY attended::numeric / possible, possible - attended DESC, last_name, first_name` (decisions 13–14).
- It has no `LIMIT`, so the client slices to X. The rows are only students below 100% in one range, so the list stays small.
- `leavingReason` is returned only when `active = false`; the UI shows `LeaverBadge` for it.

### Class summary change (decision 3)

In `summariseAttendance`, a class's `possible` sums `buildRegisterRoster` sizes only over the dates in `registers` for that class, instead of every date in `dates`. Build a `Set` of `` `${classId}|${date}` `` from `rangeRegisters` and skip dates not in it (this file is a pure helper over rows already fetched, so a `Set` here is fine). `enrolled`, `byDate` and the day-mode stats are unchanged. Update the comment at `src/app/reports/page.tsx` ("Untaken registers count as absences … decision 7") to the new rule, and update `attendanceSummary.spec.ts` and the `PeriodReport` / `page.spec.tsx` expectations that assumed the old denominator.

### UI

- `src/app/reports/_components/WorstAttendersCard.tsx`, a `'use client'` component taking `rows: WorstAttenderRow[]`:
  - `useState` for X, default 10.
  - A labelled `<input type="number" min={1} step={1}>` ("Show top"), `print:hidden`. An empty or invalid value displays 10.
  - A table of `rows.slice(0, x)` with the decision 18 columns, using `formatAttendance` and `LeaverBadge`.
  - Empty state: "Every student attended every register in this period."
- `PeriodReportSection` adds `getWorstAttenders(startDate, endDate)` to its `Promise.all` and passes the result through `PeriodReport`, which renders the card after the class summary. Day mode is untouched.

### Phase 2 tests

- `src/db/attendance.int.spec.ts`:
  - the ordering and tie-breaks
  - 100% excluded
  - a student who left mid-range is included, with their leaving reason
  - a student whose only stays in the range are in inactive classes is excluded
  - a student with only a stray mark and no stay overlapping the range is excluded
  - multi-class days counted once
- `src/lib/attendanceSummary.spec.ts`: a class with a register on one of two school days has possible equal to one day's roster.
- `WorstAttendersCard.spec.tsx`:
  - defaults to 10 rows
  - typing 3 shows 3
  - clearing the input shows 10
  - X larger than the rows shows them all
  - the empty state
  - the row link href
  - the leaver badge
  - the Not marked column shows `unmarked`, and Absent + Not marked = possible − attended
- `PeriodReport.spec.tsx` / `src/app/reports/page.spec.tsx`: mock `getWorstAttenders`, render in range and month mode, and check it is absent in day mode.
- `e2e/tests/reports/worst-attenders.e2e.ts`: tests run `fullyParallel`, so other specs' attendance can land in the same range. Use dates in an **isolated past academic year** (see §6) and assert only the relative order of this spec's own students, not row positions or totals. Seed three students with different attendance, open `/reports?mode=range&from=…&to=…`, check their order, set X to 1 and check the first row is the worst of the three. (Another spec's student could rank lower, so look the rows up by name.)

---

## 5. Phase 3 — Class Session Dates on the class page

Branch `feat/class-session-dates` from `main` after Phase 2 merges.

### Data

`getClassSessionDates(classId, academicYearId, today): Promise<ClassSessionDate[]>` in `src/db/attendance.ts`, exported from `src/db/index.ts`. The class row from `getClassWithStudents` already has `academic_year_id`.

```ts
// src/lib/classSessions.ts (client-safe)
export type ClassSessionDate = {
  date: string
  taken: boolean
  roster: number // 0 when not taken
  attended: number // present + late
  absent: number
}
```

One query:

1. **dates:** `SELECT DISTINCT attendance_registers.date` joined to `classes` where `academic_year_id = academicYearId` and `date <= today`.
2. Left join this class's `attendance_registers` row on the date; `taken` = that row exists.
3. For taken dates, `roster` = the count of distinct students in the `UNION` of this class's stays covering the date and this class's marks on the date (the Phase 1 roster rule). `attended` and `absent` are `count(*) FILTER (…)` over this class's marks on the date.
4. `ORDER BY date DESC`.

Use `registerRoster(year.start_date, today, { classId })` from §2 (look up the year by `academicYearId`) for the roster; don't write the `UNION` again.

### Date format

Add `formatSessionDate(date: string): string` to `src/lib/datetime.ts`. It uses `Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit', timeZone: SCHOOL_TIMEZONE }).formatToParts` on the noon-UTC anchor `formatCalendarDate` uses, and joins the parts as `${weekday} ${day}-${month}-${year}`. Whatever short month `Intl` gives is accepted (`Sep` or `Sept`), so the code doesn't special-case it.

### UI

- `src/app/classes/[id]/page.tsx` passes `todayInSchoolTz()` as `today`.
- `src/app/classes/[id]/ClassSessionDatesTable.tsx`: an async server component taking `{ classId, academicYearId }`. It fetches its own rows and renders a `SimpleGrid` titled **Class Session Dates**, the same pattern as `EnrolmentHistoryTable`. Columns:
  - **Date:** `formatSessionDate`
  - **Status:** green `TAKEN` / amber `NOT TAKEN` pill
  - **Attendance:** `${attendancePercent(attended, roster)}% · ${attended} attended / ${absent} absent`, `—` when not taken or the roster is 0
- Returns `null` when there are no dates.
- In `src/app/classes/[id]/page.tsx`, render it inside its own `<Suspense fallback={<TableSkeleton columns={3} />}>` in the existing `print:hidden` wrapper, after `EnrolmentHistoryTable`.

### Phase 3 tests

- `src/db/attendance.int.spec.ts`, a `getClassSessionDates` block:
  - a date only another class took shows as not taken
  - a taken date with present, late, absent and unmarked students gives the right roster and counts
  - a student who left the class before the date is excluded from the roster, but one with a mark is included
  - registers from another academic year are excluded
  - dates after `today` are excluded
  - newest first
- `src/lib/datetime.spec.ts`: `formatSessionDate('2026-09-05')` matches `/^Sat 5-Sept?-26$/`, `formatSessionDate('2026-10-17')` → `Sat 17-Oct-26`, plus a date near midnight UTC that must not shift day.
- `ClassSessionDatesTable.spec.tsx`: renders nothing with no dates; taken and not-taken pills; the attendance text; `—` on not taken; mock `@/db` with `vi.mock`.
- `src/app/classes/[id]/page.spec.tsx`: add `getClassSessionDates` to the `@/db` mock, then assert the section renders and that it was called with the class's `id`, `academic_year_id` and today.
- `e2e/tests/classes/class-session-dates.e2e.ts`: the date list is a union across **every** class in the year, so a parallel spec's register in the current year would add rows. Seed an **isolated past academic year** (see §6) with two classes. Take a register (with its `attendance_registers` row) for the first class on two dates and for the second on a third date. On the first class's page, check exactly three rows: two TAKEN with figures and one NOT TAKEN.

---

## 6. Verification (each phase)

**Isolated academic year for e2e.** `academic_years` rejects overlapping date ranges, and dates after today are excluded, so use a past year no seed or spec uses, e.g. `2015-16` (2015-09-01 to 2016-08-31). Create it with `insertRow('academic_years', …)` with `is_current = false`, and delete it in `afterAll` (`deleteAcademicYearByCode`, after deleting its classes). Each spec that needs one uses its own code (`2015-16`, `2016-17`, …) so parallel specs don't collide.

`npm run pipeline:check` passes, along with `npm run test:int` against a freshly reset local Supabase.
