# 07 — Shared UI primitives

| Delivers       | Cx  | Reuse | Arch | Size | Depends on |
| -------------- | :-: | :---: | :--: | :--: | ---------- |
| C2, C3, C5, E5 |  4  |   7   |  2   |  S   | —          |

## Goal

Four small, self-contained de-duplications that other plans (08, 11) then build on:

1. One `TabBar` replacing `AdminTabBar`, `FinanceTabBar`, `RegistrationTabs` and the inline pill
   buttons in `IncidentsClient`.
2. One `PermissionedLink` replacing `EditAction`, `StudentsTable.EditLink`, the inline
   edit-link/tooltip blocks in `IncidentsClient` / `LessonPlansClient`, and the disabled "Add X"
   button + tooltip repeated in the students, staff and classes list headers.
3. One `personName()` helper replacing ~40 inline `${last}, ${first}` / `${first} ${last}` /
   `display_name ?? …` compositions.
4. One `EmailDropdown` replacing `BulkEmailDropdown` and `StaffEmailDropdown`.

No behaviour change; the rendered markup for each replaced element should be identical or
near-identical.

## Decisions already made

- Locations: `src/components/TabBar.tsx`, `src/components/PermissionedLink.tsx`,
  `src/lib/format.ts` (alongside a re-export of `formatGbp` so there is one "formatting" module),
  `src/clientComponents/EmailDropdown.tsx`.
- `TabBar` is a server component rendering `<Link>`s. Active tab is decided by the caller passing
  `current` (it already knows the search param / path). Style: the existing grey pill bar
  (`mb-6 flex gap-1 rounded-xl bg-gray-100 p-1` with white active pill) — the Incidents blue-pill
  style is retired. Optional `count` badge per tab (registrations shows pending counts today).
- `PermissionedLink` has three states driven by two booleans, exactly as `EditAction` does now:
  `allowed` → link; `!allowed && showDisabled` → greyed text with `Tooltip`; else `null`.
- `personName` handles the three shapes in the codebase: `{ first_name, last_name }`,
  `{ first_name, last_name, display_name? }` (staff), and nullable objects (guardians may be null →
  returns `'—'`).
- `EmailDropdown` keeps `StaffEmailDropdown`'s superset of props (it has the per-recipient list);
  `BulkEmailDropdown` callers pass the same shape.

## API

```tsx
// src/components/TabBar.tsx
export type Tab = { key: string; label: string; href: string; count?: number }
<TabBar tabs: Tab[] current: string ariaLabel: string />

// src/components/PermissionedLink.tsx
<PermissionedLink href allowed: boolean showDisabled: boolean disabledReason: string
                  className?: string /* link classes; default rowLink */ children />
// Renders <Link> | <Tooltip text={disabledReason}><span className="cursor-not-allowed …">children</span></Tooltip> | null

// src/lib/format.ts
export type NamedPerson = { first_name: string; last_name: string; display_name?: string | null }
export function personName(p: NamedPerson | null | undefined, style: 'lastFirst' | 'firstLast' = 'firstLast'): string
// staff: display_name wins when style === 'firstLast' and display_name is set (current StaffTable behaviour)
export { formatGbp } from './fees'

// src/clientComponents/EmailDropdown.tsx  ('use client')
<EmailDropdown recipients: { name: string; email: string }[] subject?: string buttonLabel: string
               triggerClassName?: string emptyReason: string mailtoUnavailableReason: string />
// Behaviour = StaffEmailDropdown today (copy all, open mailto with BCC, per-recipient list); uses lib/mailto.
```

## Implementation steps

1. `TabBar`: create + spec. Replace `AdminTabBar` (admin page), `FinanceTabBar` (finance page),
   `RegistrationTabs` (registrations page) and the pill buttons in `IncidentsClient` (keep its
   `router.replace` behaviour for now — plan 08 makes it a server page; here just render `TabBar`
   with `href`s to `/incidents?tab=…`). Delete the three old components and their specs.
2. `PermissionedLink`: create + spec. Replace `EditAction` (Staff/Classes tables), `EditLink` in
   `StudentsTable`, the edit blocks in `IncidentsClient` and `LessonPlansClient`, and the header
   "Add X" button/tooltip in `students/page.tsx`, `staff/page.tsx`, `classes/page.tsx` (pass the
   blue button classes via `className`). Delete `EditAction.tsx`.
3. `personName`: create + spec. Replace inline compositions found with
   `rg -n "last_name\}, \{|first_name\} \{|display_name \?\?" src --glob '!*.spec.*'`. Also
   replace `fullName` in `src/lib/grid/search.ts` with `personName(...,'firstLast')` if identical.
4. `EmailDropdown`: create from `StaffEmailDropdown`, update the three call sites
   (`staff/page.tsx`, `classes/[id]/page.tsx`, `attendance/AttendanceRegister.tsx`), delete both old
   components and their specs; write one spec.
5. Verify visually on `/staff`, `/classes/[id]`, `/incidents`, `/finance`, `/admin`,
   `/registrations` that nothing moved.

## Files

**Create:** `src/components/TabBar.tsx`, `src/components/PermissionedLink.tsx`, `src/lib/format.ts`,
`src/clientComponents/EmailDropdown.tsx`, specs.
**Delete:** `src/app/admin/_components/AdminTabBar.tsx`, `src/app/finance/_components/FinanceTabBar.tsx`,
`src/app/registrations/RegistrationTabs.tsx`, `src/components/EditAction.tsx`,
`src/clientComponents/BulkEmailDropdown.tsx`, `src/clientComponents/StaffEmailDropdown.tsx`, their specs.
**Modify:** call sites listed above.

## Acceptance criteria

- `rg "TabBar|Tabs\b" src/app --glob '!*.spec.*' -l` lists only importers of `@/components/TabBar`.
- `rg "cursor-not-allowed" src/app` returns nothing (all via `PermissionedLink`).
- `rg "display_name \?\?" src/app` returns nothing.
- `rg "EmailDropdown" src -l` returns only `src/clientComponents/EmailDropdown.tsx`, its spec and
  its three call sites.
- E2E suites `navigation`, `hr`, `finance`, `registrations`, `classes` pass unchanged.
- `npm run pipeline:check` green.

## Deliberate UX changes

- Incidents tabs use the same grey pill style as every other tab bar.
