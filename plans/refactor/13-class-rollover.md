# 13 — Class roll-over (optional; needs product sign-off)

| Delivers | Cx  | Reuse | Arch | Size | Depends on |
| -------- | :-: | :---: | :--: | :--: | ---------- |
| E3       |  6  |   4   |  4   |  M   | 10         |

> **Do not start this plan until the owner has approved the workflow change below.**

## Goal

Replace the class-migration wizard (per-student move / none / left / graduated / transferred
choices plus roster-drift validation — ~660 lines across `ClassMigrationForm`, `ClassMigrationTab`,
its actions and `migrateClass`) with a two-step "Roll over class" flow:

1. **Roll over**: create next year's class with the same name/year group/teacher/room (editable in a
   short form), copy every currently-enrolled active student into it, close the source enrolments
   on the new year's start date, deactivate the source class.
2. **Tidy up**: admins remove individual students from the new class via the existing class
   enrolment editor, or mark them as leavers via the existing `LeaverSection`.

Trade-off accepted by the owner: one extra step per leaver at year end, in exchange for a flow
that fits on a phone screen and ~600 fewer lines.

## Decisions already made

- Route: `/admin?tab=class-migration` becomes `/admin?tab=roll-over` with label "Roll over
  classes". The tab lists active classes in the **current** academic year (SimpleGrid: name, year
  group, teacher, enrolled count, "Roll over" `PermissionedLink` → `/admin/roll-over/[classId]`).
- Page `/admin/roll-over/[classId]`: `requireRole(isAdmin)`; form (plan 04 kit) prefilled with the
  source class's name/year group/room/teacher and a `SelectField` of academic years **after** the
  current one (must exist; if none, show `EmptyState` "Create the next academic year first" with a
  link to the academic years tab). Submit label "Roll over N students".
- DB: `rollOverClass(tx, { sourceClassId, targetAcademicYearId, name, yearGroup, roomNumber,
teacherId })` in `src/db/classes.ts`, one transaction:
  1. lock + validate source (`active`, belongs to current year) → `DbError('Source class is already inactive')` etc. (reuse `migrate_class`'s messages where they still apply);
  2. insert target class;
  3. select current stays of **active** students on the source class;
  4. insert `student_classes` rows for them with `start_date = target year start_date`;
  5. `closeEnrolments(tx, allSourceStayIds, targetYearStartDate - 1 day)` — including inactive
     students' rows, as `migrate_class` does;
  6. update source `active = false`;
  7. return `{ newClassId, moved: n }`.
- Action: `rollOverClassAction(sourceClassId, formData)` via `runAction` with
  `permission: isAdmin`, `audit: { entity: 'class', action: 'update', … details: { rolledOverFrom, moved } }`,
  `redirectTo: (r) => \`/classes/${r.newClassId}\``.
- Delete `migrateClass` (TS, ported in plan 10), `ClassMigrationForm`, `ClassMigrationTab`,
  `admin/_tabs/class-migration/actions.ts`, their specs and the E2E `class-migration` tests; add
  `e2e/tests/admin/roll-over.e2e.ts` covering: happy path (target class exists, counts match,
  source inactive), no-next-year empty state, leaver excluded from copy but their row closed.

## Implementation steps

1. `rollOverClass` + int spec.
2. Tab list + page + form + action.
3. Delete the wizard and its tests; update `routes.ts` label; update `README.md` and
   `PERMISSIONS.md` ("Class migration" → "Roll over classes").
4. Run the admin E2E suite.

## Acceptance criteria

- `rg -i "migrat" src e2e README.md` returns nothing except the word inside `supabase/migrations`
  paths.
- Roll-over completes in one form submit; the new class page shows the copied roster; the source
  class shows as inactive with enrolment history ending the day before the new year starts.
- `npm run pipeline:check` green.

## Deliberate UX changes

- The per-student migration wizard is replaced by roll-over + individual edits.
