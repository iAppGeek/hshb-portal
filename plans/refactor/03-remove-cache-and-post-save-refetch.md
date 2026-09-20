# 03 — Remove the cache and the post-save re-fetch

| Delivers | Cx  | Reuse | Arch | Size | Depends on |
| -------- | :-: | :---: | :--: | :--: | ---------- |
| D1, G2   |  8  |   5   |  9   |  M   | 02         |

## Goal

Delete the per-query `unstable_cache` layer and both invalidation mechanisms (`updateTag` in
`src/db`, `revalidatePath` in actions), the manual "Refresh data" button that papers over their
disagreements, and the E2E fixture that clicks it. Then stop stay-on-page saves (attendance,
staff sign-in, fees, payments) from forcing the browser to re-download the page it is already on.

This is the biggest single mobile improvement in the programme: on a weak signal the post-save
re-fetch is a second multi-second wait after "Register saved" appears.

## Why removing the cache is safe

- Every authenticated page is already dynamic (it calls `auth()`, which reads cookies), so nothing
  is statically cached today; `unstable_cache` only saved DB time inside the render.
- Data volume is a few hundred students; a Supabase query from a co-located region is 5–20 ms.
- The cache is the root cause of PR #27 ("show saved changes without reloading"), the "Refresh
  data" button, and `e2e/fixtures/loadWithFreshData.ts`.

**Owner precondition:** the region check in `README.md` → Owner tasks should be done first. If the
Netlify function and Supabase regions cannot be co-located, tell the agent; the plan is unchanged
but the owner should expect slightly higher TTFB on the dashboard until plan 10 collapses its eight
queries into one.

## Decisions already made

- No replacement cache. Not `'use cache'`, not `React.cache`, not `unstable_cache` at page level.
- Stay-on-page actions return the saved data; the client updates local state. They do **not** call
  `router.refresh()`.
- Optimistic UI uses React's `useOptimistic` only where the plan lists it.
- Removing `revalidatePath` from redirecting actions is safe: the redirect target is a dynamic
  route and Next 16's client router does not reuse dynamic RSC payloads (`staleTimes.dynamic` is 0).

## Implementation steps

### Part 1 — remove the cache

1. In every `src/db/*.ts`, unwrap `unstable_cache(fn, keys, opts)` to `fn` (exported as a plain
   `async function`). Files: `students.ts` (9), `classes.ts` (7), `staff.ts` (4), `student-fees.ts`
   (3), `registrations.ts` (3), `photoOptOuts.ts` (3), `staff-payroll.ts` (2), `fee-plans.ts` (2),
   `guardians.ts` (1), `academic-years.ts` (1). Remove `OPTS` constants and `tags` arrays.
2. Delete every `updateTag(...)` call in `src/db/*.ts` and the `import { updateTag } from 'next/cache'`.
3. Remove the `revalidate` option from `runAction` (`src/lib/action.ts`) and every `revalidate:
[...]` argument in `src/app/**/actions.ts`. Delete any remaining direct `revalidatePath` imports.
4. Delete `src/app/actions.ts` (`revalidateAllCaches`). Remove `refreshAction` prop and the
   "Refresh data" `<form>` from `src/app/_components/PortalSidebar.tsx` and its call in
   `src/app/layout.tsx`.
5. `e2e/fixtures/loadWithFreshData.ts`: reduce to a plain `page.goto(url)`; update the comment.
   Update `e2e/fixtures/index.ts` if the fixture signature changes.
6. Update specs that mock `next/cache` (`vi.mock('next/cache')`) — remove the mock and any
   assertion on `revalidatePath` / `updateTag` calls. Assert on the DB write and the returned
   result instead.

### Part 2 — no re-fetch after stay-on-page saves

7. **Attendance** (`src/app/attendance/actions.ts`, `AttendanceForm.tsx`):
   - `saveAttendanceAction` returns `{ saved: AttendanceRecord[] }` on success (the rows as written,
     including `updated_at`), still `ActionResult`-compatible on error. Type it as
     `Promise<ActionResult | { saved: AttendanceRecord[] }>`. Note: in plan 02 `runAction` returns
     `ActionResult`; here allow `run` to return a value that `runAction` passes through when there is
     no `redirectTo`. Add that to `runAction`: if `run` returns non-`undefined` and no `redirectTo`,
     return `{ data: result }`. Update `ActionResult` to `| { data: T }` generically:
     `ActionResult<T = never> = { error: string; fieldErrors? } | { data: T } | void`.
   - In `AttendanceForm`, wrap the per-student status buttons in `useOptimistic` so a tap updates the
     status immediately; on `{ error }` roll back and show the error. On `{ data }` set local
     records from the response and show "Register saved" (existing message).
   - The push send in this action stays (plan 12 moves it); ensure it is not awaited before the
     response is returned.
8. **Staff sign-in/out** (`src/app/staff-attendance/actions.ts`, `StaffAttendanceTable.tsx`): return
   `{ data: StaffAttendanceRow }`; the table updates the row locally with `useOptimistic` for the
   Sign In / Sign Out button state.
9. **Finance student page** (`src/app/finance/students/[id]/actions.ts`, `StudentFeesForm.tsx`,
   `PaymentForm.tsx`, `DeletePaymentButton.tsx`): return the updated account / new payment /
   deleted id; parent `page.tsx` passes initial data to a small client wrapper that holds
   `payments` and `account` in state and applies results. The summary figures on that page are
   derived from those two pieces of state (move the derivation from `page.tsx` into a pure function
   in `src/app/finance/_lib/studentFeeSummary.ts` if it isn't already there).
10. **HR payroll** and **academic years** currently redirect after save — leave them (they follow
    the CRUD redirect pattern).
11. Any other action that both stays on page and relied on `revalidatePath` to refresh visible data:
    search `rg "revalidatePath" src` before step 3 and handle each with the same pattern.

## Files

**Modify:** all cached `src/db/*.ts`, `src/lib/action.ts`, all `src/app/**/actions.ts`,
`src/app/layout.tsx`, `src/app/_components/PortalSidebar.tsx`, `src/app/attendance/AttendanceForm.tsx`,
`src/app/staff-attendance/StaffAttendanceTable.tsx`, `src/app/finance/students/[id]/*.tsx`,
`e2e/fixtures/loadWithFreshData.ts`, affected specs.
**Delete:** `src/app/actions.ts`.

## Acceptance criteria

- `rg "unstable_cache|updateTag|revalidatePath|revalidateTag|next/cache" src e2e` returns nothing.
- No "Refresh data" button in the sidebar; `rg "Refresh data" src e2e` returns nothing.
- Manual check on a throttled connection (Chrome DevTools "Slow 3G"): saving an attendance register
  shows the tapped status instantly and "Register saved" once, with **no** second page load in the
  Network panel.
- After creating a student and being redirected to `/students`, the new student is in the list
  without any manual refresh.
- `npm run pipeline:check` green.

## Deliberate UX changes

- "Refresh data" button removed from the sidebar.
- Attendance status taps reflect immediately (optimistic).
