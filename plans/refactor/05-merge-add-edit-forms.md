# 05 — Merge Add/Edit forms per entity

| Delivers | Cx  | Reuse | Arch | Size | Depends on |
| -------- | :-: | :---: | :--: | :--: | ---------- |
| B2       |  9  |   9   |  5   |  M   | 04         |

## Goal

One form component and one save action per entity, following the pattern `ClassForm`,
`FeePlanForm` and `AcademicYearForm` already use. Removes ~1,100 lines of duplicated student form,
~135 of staff, ~150 of incident, ~90 of lesson plan, and the verbatim copy of `resolveGuardian`
between the two student action files.

## Decisions already made

- Pattern (from `ClassForm.tsx`): `<EntityForm initial?: Entity; …lookups; action; submitLabel />`.
  The form renders `defaultValue`s from `initial` when present. Sections that only apply to editing
  (student classes and consents, leaver section) render when `initial` is set.
- One action per entity: `saveXAction(id: string | null, formData: FormData)`. `id === null`
  creates. Permission: `canCreateX` when creating, `canEditX` when editing (for entities where the
  two differ). Redirect target unchanged from today.
- Routes stay: `/x/new` and `/x/[id]/edit`. Their `page.tsx` files become thin: `requireRole`,
  fetch `initial` + lookups, render the form.
- Action files move up one level to the entity folder: `src/app/students/actions.ts`,
  `src/app/staff/actions.ts`, `src/app/incidents/actions.ts` (exists), `src/app/lesson-plans/actions.ts`
  (exists). Delete the `new/actions.ts` and `[id]/edit/actions.ts` files.
- Guardian sub-form becomes a shared client component `src/components/form/GuardianPicker.tsx`
  (new vs existing toggle, search, fields). Its server-side counterpart is
  `src/lib/guardians/resolveGuardian.ts` (moved from the two action files; one copy).
- `createIncidentAction`'s missing permission check is fixed here: `saveIncidentAction` uses
  `canEditIncidents` for edit and, for create, "any signed-in staff" (current behaviour for create,
  documented in `PERMISSIONS.md`). Confirm the row in `PERMISSIONS.md` says teachers can create
  incidents for their own students; do not widen or narrow it.

## Per-entity specification

### Students

- `src/app/students/StudentForm.tsx` replaces `new/AddStudentForm.tsx` and
  `[id]/edit/EditStudentForm.tsx`. Props:
  `{ initial?: StudentFormData; guardians: GuardianSummary[]; classes?: ClassOption[]; enrolledClassIds?: string[]; action: (fd: FormData) => Promise<ActionResult>; submitLabel: string }`.
  `StudentFormData` is the existing `StudentData` type from the edit form, exported from the form.
- Sections: Student details · Address (RadioGroup own/guardian) · Primary guardian (GuardianPicker)
  · Secondary guardian (optional, GuardianPicker) · Additional contacts 1–2 (optional) ·
  Classes (edit only, `initial && initial.active`) · Consents (edit only) · Actions.
- `LeaverSection` stays a separate component rendered by the edit page beneath the form (it has its
  own action), unchanged.
- `src/app/students/actions.ts`: `saveStudentAction(id, formData)` — body is the current
  `updateStudentAction` with `createStudent` when `id === null`; `markStudentAsLeaverAction`
  moves here unchanged. Field errors for guardian sub-forms carry the prefix (see plan 04 step 2).
- Hidden inputs `has_secondary` etc. stay (they drive server parsing).

### Staff

- `src/app/staff/StaffForm.tsx` replaces `AddStaffForm` / `EditStaffForm`. Props
  `{ initial?: StaffRow; action; submitLabel }`. Role select uses `roleLabels`.
- `src/app/staff/actions.ts`: `saveStaffAction(id, formData)`; `createStaffSchema` /
  `updateStaffSchema` collapse to one `staffSchema` if their only difference is optionality that
  the form already guarantees — check `src/lib/schemas.ts` lines 252–290; if `updateStaffSchema`
  differs materially (e.g. email immutable), keep both and pick by `id`.

### Incidents

- `src/app/incidents/IncidentForm.tsx` replaces `AddIncidentForm` / `EditIncidentForm`. Props
  `{ initial?: IncidentRow; students: StudentOption[]; defaultType?: IncidentType; action; submitLabel }`.
  When `initial` is set the student is shown read-only (current edit behaviour); otherwise the
  existing `StudentSearch` sub-component (move it into the form file or `src/components/form/StudentSearch.tsx`
  if plan 11 will also need it — it will, for photo opt-out matching; put it in `components/form`).
- `src/app/incidents/actions.ts`: `saveIncidentAction(id, formData)` replacing create/update.

### Lesson plans

- `src/app/lesson-plans/LessonPlanForm.tsx` replaces both forms. Props
  `{ initial?: LessonPlanRow; classes: ClassOption[]; action; submitLabel }`. Class select is disabled
  with the current value when `initial` is set (current behaviour).
- `src/app/lesson-plans/actions.ts`: `saveLessonPlanAction(id, formData)`. Teacher-owns-class check
  stays inside `run`.

### Already merged (no change)

`ClassForm`, `FeePlanForm`, `AcademicYearForm` — leave as they are, but move
`classes/new/actions.ts` + `classes/[id]/edit/actions.ts` into `classes/actions.ts` with
`saveClassAction(id, formData)` for symmetry; same for `finance/fee-plans/actions.ts` if it has
separate create/update functions.

## Implementation steps

1. Create `src/components/form/GuardianPicker.tsx` and `src/lib/guardians/resolveGuardian.ts`
   from the existing code (the edit form's version is the superset). Unit-test the picker's
   new/existing toggle and search threshold; move `resolveGuardian` tests from the two action specs.
2. For each entity in the order Lesson plans → Incidents → Staff → Students (smallest first):
   a. Create the merged form using the plan-04 kit.
   b. Create/merge the action; delete the old action files.
   c. Rewrite the two `page.tsx` files to render the merged form.
   d. Delete the two old form files and their specs; write one form spec that renders with and
   without `initial` and asserts the edit-only sections.
   e. Run the entity's E2E tests (`e2e/tests/students/*`, etc.).
3. Move class and fee-plan actions as noted.
4. Update `README.md` project-structure snippet if it lists form files.

## Files

**Create:** `StudentForm.tsx`, `StaffForm.tsx`, `IncidentForm.tsx`, `LessonPlanForm.tsx`,
`src/app/{students,staff,classes}/actions.ts`, `src/components/form/GuardianPicker.tsx`,
`src/components/form/StudentSearch.tsx`, `src/lib/guardians/resolveGuardian.ts`, specs.
**Delete:** `AddStudentForm.tsx`, `EditStudentForm.tsx`, `AddStaffForm.tsx`, `EditStaffForm.tsx`,
`AddIncidentForm.tsx`, `EditIncidentForm.tsx`, `AddLessonPlanForm.tsx`, `EditLessonPlanForm.tsx`,
`students/new/actions.ts`, `students/[id]/edit/actions.ts`, `staff/new/actions.ts`,
`staff/[id]/edit/actions.ts`, `classes/new/actions.ts`, `classes/[id]/edit/actions.ts`, their specs.

## Acceptance criteria

- `rg "^export default function (Add|Edit)\w+Form" src/app` returns nothing.
- `rg "function resolveGuardian" src` returns exactly one file.
- Each entity's `new` and `[id]/edit` pages import the same form component.
- All E2E tests under `e2e/tests/students`, `classes`, `hr`, `finance` pass unchanged.
- Net line count of `src/app/students/**` (non-spec) is at least 40% lower than before.
- `npm run pipeline:check` green.

## Deliberate UX changes

None. (Incident create permission is unchanged; see decisions.)
