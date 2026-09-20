# 08 — Lists on the grids; entity view pages

| Delivers   | Cx  | Reuse | Arch | Size | Depends on |
| ---------- | :-: | :---: | :--: | :--: | ---------- |
| C1, C4, G4 |  7  |   7   |  6   |  M   | 04, 06, 07 |

## Goal

- Every list renders through `SimpleGrid` (server, zero JS) or `FunctionalGrid` (client, TanStack).
  Retire the five hand-rolled tables.
- Every entity follows list → view → edit. Add `/students/[id]` and `/lesson-plans/[id]` view
  pages and delete the two detail modals.
- Teacher-facing screens ship less JavaScript: Incidents and Lesson plans become server pages with
  URL filters; the attendance page no longer bundles the student modal.

## Decisions already made

- Grid choice rule: **`SimpleGrid` unless the list needs client-side search** (students, guardians,
  registrations, student fees keep `FunctionalGrid`). Incidents, lesson plans, academic years,
  staff attendance, enrolment history, staff, classes → `SimpleGrid`.
- Filters live in the URL (`searchParams`) and are applied in the DB query, not in the browser —
  the pattern `registrations/page.tsx` already uses.
- View pages are server components. Sections are the same as the current modals (so nothing is
  lost), rendered with `DefinitionList` (plan 04) inside `SectionCard`. Medical/consent sections
  are gated by `canSeeStudentMedical` exactly as the modal does now.
- `StaffAttendanceTable` keeps its per-row Sign In / Sign Out buttons: it becomes a
  `FunctionalGrid` with a client `cell` renderer (the grid is already client-side), not a hand-rolled
  table. No search.
- `AcademicYearsTable` drops inline editing in favour of `/admin/academic-years/[id]/edit` (a page
  rendering the existing `AcademicYearForm`) — consistency with every other entity. "Make current"
  stays as a row action button.
- Mobile: `SimpleGrid mobile="stacked"` with a `StackedRowSpec` for every list that currently has a
  card layout on small screens (incidents, lesson plans). Do not drop the mobile card experience.

## Per-screen specification

### Incidents → server page

- `src/app/incidents/page.tsx`: `searchParams: { type?: IncidentType }` (default `'medical'`);
  `requireSession`; `getIncidents({ type, teacherStaffId?: actor.role === 'teacher' ? actor.staffId : undefined })`
  — extend the existing `getIncidents` to take `type` (it currently fetches 50 of all types; filter
  in the query). Render `PageHeader` (action = `PermissionedLink` "Add incident" → `/incidents/new?type=`),
  `TabBar` for the three types, the teacher notice, then `SimpleGrid mobile="stacked"` with the
  current columns (date, student, title, description, recorded by, last updated, guardians
  notified, actions). Delete `IncidentsClient.tsx`.
- Column `cell`s use `personName` and `formatDateInSchoolTz`.

### Lesson plans → server page + view page

- `src/app/lesson-plans/page.tsx`: `searchParams: { classId? }`; `SimpleGrid mobile="stacked"`;
  "View" links to `/lesson-plans/[id]`. Delete `LessonPlansClient.tsx` and its `LessonPlanModal`.
- `src/app/lesson-plans/[id]/page.tsx`: `requireSession`; `getLessonPlanById`; teacher may only
  view own class's plans (`notFound()` otherwise); `PageHeader` with `backHref="/lesson-plans"`
  and action = `PermissionedLink` "Edit"; `DefinitionList` of date, class, topic, objectives,
  activities, resources, notes (whatever the modal shows today). Add `loading.tsx`.

### Students → view page

- `src/app/students/[id]/page.tsx`: `requireSession`; `getStudentById`; teachers may only view
  students in their classes (`getStudentIdsByTeacher` includes → else `notFound()`); `PageHeader`
  with `backHref="/students"`, `subtitle` = student code, action = `PermissionedLink` "Edit".
  Sections: Details · Address · Classes · Guardians & contacts · Medical (gated) · Consents (gated)
  · Notes. Reuse the section bodies from `StudentDetailsModal.tsx` by moving them into
  `src/app/students/[id]/_components/*.tsx` as server components. Add `loading.tsx`.
- `StudentsTable`: the "Details" button becomes a `<Link href={/students/${id}}>` (`rowLink`
  style); remove `selected` state and the modal import.
- `attendance/AttendanceForm.tsx`: the student-name tap that opened the modal becomes a `<Link>`
  to `/students/[id]` (opens in same tab; browser back returns to the register with its URL state).
- Delete `src/components/StudentDetailsModal.tsx` and spec after both call sites are migrated.

### Academic years

- `src/app/admin/_tabs/academic-years/AcademicYearsTable.tsx` → `SimpleGrid` (server); columns
  code, dates, current badge, actions (`PermissionedLink` Edit → `/admin/academic-years/[id]/edit`,
  `MakeCurrentButton` unchanged). New route `src/app/admin/academic-years/[id]/edit/page.tsx` and
  `/admin/academic-years/new/page.tsx` rendering `AcademicYearForm`; the "Add academic year" form
  currently inline in the tab moves to `/new`. Actions move to `src/app/admin/academic-years/actions.ts`
  as `saveAcademicYearAction(id, formData)` (plan 05 pattern).

### Staff attendance

- `StaffAttendanceTable.tsx` → `FunctionalGrid` with columns name, role, signed in, signed out,
  actions (client cell rendering the existing buttons with `useOptimistic` from plan 03).
  `mobile="stacked"`. Remove the hand-rolled `<table>` and card markup. `SignInSheetPrintTable`
  (print-only) stays as is.

### Already on a grid (verify only)

`StaffTable`, `ClassesTable`, `EnrolmentHistoryTable`, `StaffPayrollList`, fee-plan lists → `SimpleGrid`;
`StudentsTable`, `GuardiansTable`, `RegistrationsTable`, `StudentFeesTable` → `FunctionalGrid`.
`PhotoOptOutSection` is handled in plan 11.

## Implementation steps

1. Extend `getIncidents` and `getLessonPlans` in `src/db` to accept the filter parameters (plain
   query `.eq()` additions; plan 09 will port them).
2. Incidents page (delete client) → run `e2e` incidents-related tests if any; add one E2E:
   switching tab changes URL and rows.
3. Lesson plans page + view page.
4. Student view page; update `StudentsTable` and `AttendanceForm`; delete the modal. Update
   `e2e/tests/students/*.e2e.ts` where they open the modal → navigate to the view page.
5. Academic years pages + table.
6. Staff attendance table.
7. Update `src/lib/routes.ts` (plan 06) if new nav-visible routes are added (none expected — the
   new routes are prefixes of existing ones).
8. Check `next build` route bundle sizes for `/attendance`, `/incidents`, `/lesson-plans` before and
   after; record in the PR.

## Files

**Create:** `src/app/students/[id]/page.tsx` (+ `loading.tsx`, `_components/*`),
`src/app/lesson-plans/[id]/page.tsx` (+ `loading.tsx`), `src/app/admin/academic-years/{new,[id]/edit}/page.tsx`,
`src/app/admin/academic-years/actions.ts`, specs.
**Delete:** `IncidentsClient.tsx`, `LessonPlansClient.tsx`, `StudentDetailsModal.tsx`, the old
academic-years actions/tab form, hand-rolled table markup in `StaffAttendanceTable.tsx`,
`AcademicYearsTable.tsx` client state, all related specs.
**Modify:** `incidents/page.tsx`, `lesson-plans/page.tsx`, `StudentsTable.tsx`, `AttendanceForm.tsx`,
`StaffAttendanceTable.tsx`, `AcademicYearsTab.tsx`, `src/db/incidents.ts`, `src/db/lesson-plans.ts`.

## Acceptance criteria

- `rg "<table" src/app --glob '!*.spec.*'` returns only print-only components
  (`SignInSheetPrintTable`, `ClassRegisterCard`) and `AttendanceForm` (an interactive register, not
  a list).
- `rg "Modal" src --glob '!*.spec.*' -l` returns nothing under `src/components` or `src/app` except
  Headless UI dialogs in registrations (plan 11 handles those).
- `/students/[id]` and `/lesson-plans/[id]` exist, use `PageHeader`, and 404 for unknown ids and
  for teachers outside their classes.
- `/incidents?type=behaviour` renders only behaviour incidents server-side (no client filtering:
  the page has no `'use client'` file except shared components).
- Client bundle for `/attendance` and `/incidents` is smaller than before (numbers in PR).
- `npm run pipeline:check` green.

## Deliberate UX changes

- Student and lesson-plan details open as pages (linkable, back-button friendly) instead of modals.
- Academic years are edited on their own page instead of inline.
