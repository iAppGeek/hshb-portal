# 11 — Unify the registration and photo-opt-out review flows

| Delivers | Cx  | Reuse | Arch | Size | Depends on |
| -------- | :-: | :---: | :--: | :--: | ---------- |
| E2       |  7  |   8   |  4   |  M   | 02, 04, 07 |

## Goal

Photo opt-out stays as a feature. Its **admin review UI** becomes the same shape as registration
review: a list with status tabs, a detail page per submission, and the same Approve / Reject /
Delete dialogs. Two near-identical dialog pairs (`RejectDialog` ≈ `RejectOptOutDialog`,
`ApproveDialog` ≈ `ApplyOptOutDialog`) become one generic set. The public `/register/photo-opt-out`
form, the DB tables and the notification/audit behaviour are unchanged.

## Decisions already made

- Routes: `/registrations` gains a fourth tab "Photo opt-outs" (via plan 07's `TabBar`) that lists
  `photo_consent_opt_outs` in a `FunctionalGrid` (search by child name) — replacing the
  `PhotoOptOutSection` block and its hand-rolled table at the bottom of the registrations page.
  Detail page: `/registrations/photo-opt-outs/[id]`. Status is a `?status=` search param on the list
  (pending default), like registrations' `?tab=`.
- Generic dialogs in `src/components/dialogs/`:
  - `ConfirmDialog` — title, body, confirm label (danger or primary), pending label, `onConfirm:
() => Promise<ActionResult>`; shows the returned error inline. Used for Delete (both entities).
  - `ReasonDialog` — extends `ConfirmDialog` with a required `TextAreaField` (`name="reason"`,
    min length from the existing Zod schema) whose value is passed to `onConfirm(reason)`. Used for
    Reject (both entities).
  - `MatchStudentDialog` — the "match to existing student / create new" flow. It takes
    `candidates: StudentMatch[]` (from `findStudentMatches`) and `onConfirm(choice: { mode:
'existing'; studentId } | { mode: 'new' })`. The registration approve flow additionally needs
    class selection and guardian matching; keep those as a `RegistrationApproveDialog` that composes
    `MatchStudentDialog`'s student section (export the section as `StudentMatchList`). The opt-out
    flow uses `MatchStudentDialog` directly with a "must choose existing" restriction (`allowNew:
false`), since applying an opt-out to a non-existent student is not meaningful — confirm this
    matches `apply_photo_opt_out`'s current behaviour before removing any "create" path; if the
    SQL creates students, keep `allowNew: true`.
  - All dialogs use Headless UI `Dialog` as today, `useServerForm` (plan 04) for submission, and
    render via a small `useDialog()` state helper (`{ open, close, isOpen, props }`) so list rows
    don't each hold `useState` per dialog id.
- Actions: `src/app/registrations/actions.ts` and `photo-opt-out-actions.ts` merge into
  `src/app/registrations/actions.ts` with clearly named functions — `approveRegistrationAction`,
  `rejectRegistrationAction`, `deleteRegistrationAction`, `applyPhotoOptOutAction`,
  `rejectPhotoOptOutAction`, `deletePhotoOptOutAction` — all via `runAction`. Zod schemas for the
  two reject reasons collapse to one `rejectReasonSchema` in `src/lib/schemas.ts` if identical.
- `RegistrationReview.tsx` is refactored to use `DefinitionList` (plan 04) and becomes the model for
  `PhotoOptOutReview.tsx` (child name, DOB, requester, relationship, contact, submitted, status,
  matched student link when actioned).
- `ShareLinksBar` (the "copy public form link" bar) stays, gaining the opt-out link if not present.

## Implementation steps

1. Create `src/components/dialogs/{ConfirmDialog,ReasonDialog,MatchStudentDialog,useDialog}.tsx`
   with specs (open/close, pending state, inline error, reason validation, candidate selection).
2. Replace `RejectDialog` and `RejectOptOutDialog` with `ReasonDialog`; replace the inline delete
   confirmation blocks (`deletingId` red panel in `PhotoOptOutSection`, and its registration
   counterpart if one exists in `RegistrationsTable`) with `ConfirmDialog`; delete the old files.
3. Build `RegistrationApproveDialog` from `ApproveDialog` using `StudentMatchList`; delete
   `ApproveDialog`. Build the opt-out apply flow on `MatchStudentDialog`; delete
   `ApplyOptOutDialog`.
4. New list tab + `FunctionalGrid` for opt-outs (`src/app/registrations/PhotoOptOutsTable.tsx`);
   columns: child, DOB, requested by, submitted, status badge, actions (`PermissionedLink` "Review"
   → detail page). Remove `PhotoOptOutSection.tsx`.
5. Detail page `src/app/registrations/photo-opt-outs/[id]/page.tsx` (+ `loading.tsx`) with
   `requireRole(canManageRegistrations)` (use whatever helper gates registrations today),
   `notFound()` on miss, `PageHeader` with back link, `PhotoOptOutReview`, action buttons opening
   the dialogs.
6. Merge action files; update E2E tests in `e2e/tests/registrations/*` to the new tab and detail
   page; keep every existing assertion about outcomes (status changes, audit rows, error strings).
7. `README.md` registrations section: describe the shared review flow.

## Files

**Create:** `src/components/dialogs/*`, `PhotoOptOutsTable.tsx`, `PhotoOptOutReview.tsx`,
`photo-opt-outs/[id]/{page,loading}.tsx`, `RegistrationApproveDialog.tsx`, specs.
**Delete:** `RejectDialog.tsx`, `RejectOptOutDialog.tsx`, `ApproveDialog.tsx`, `ApplyOptOutDialog.tsx`,
`PhotoOptOutSection.tsx`, `photo-opt-out-actions.ts`, their specs.
**Modify:** `registrations/page.tsx`, `registrations/actions.ts`, `RegistrationReview.tsx`,
`RegistrationsTable.tsx`, `src/lib/schemas.ts`, E2E tests, `README.md`.

## Acceptance criteria

- `rg "Dialog" src/app --glob '!*.spec.*' -l` returns only files importing from
  `@/components/dialogs` (plus `RegistrationApproveDialog.tsx`).
- `rg "photo-opt-out-actions" src` returns nothing.
- Registrations page has four tabs; the opt-out tab renders a `FunctionalGrid`; each opt-out has a
  detail page that 404s for unknown ids.
- Rejecting an opt-out and rejecting a registration go through the **same** component (assert by
  `data-testid="reason-dialog"` in both E2E flows).
- All audit-log actions (`photo_opt_out_applied|rejected|deleted`, `registration_*`) are still
  written with the same `action` names.
- `npm run pipeline:check` green.

## Deliberate UX changes

- Photo opt-outs move from a section below registrations into their own tab with a detail page.
- Delete confirmations use a dialog instead of an inline red panel.
