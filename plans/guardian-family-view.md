# Guardians list & family view (hshb-portal)

**Goal:** When a parent emails the school, an admin can search guardians by name or email, open that guardian, and immediately see their children — including children whose _primary_ guardian is someone else. Adds a browsable `/guardians` list and a guardian-anchored family view. No new tables.

---

## 0. Decisions

| #   | Decision                        | Outcome                                                                                                                                                                                                                                                                |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Family model**                | **Guardian-centric.** "The family" is whatever hangs off the guardian you opened — their children across all four contact slots. No `families` table, no `family_id`, no derived grouping.                                                                             |
| 2   | **Different primary guardians** | A non-issue by construction. Because the view is anchored on one guardian, the portal never has to choose a canonical family unit. Mum being primary for one child and Dad primary for another is ordinary data; both children appear on both parents' pages.          |
| 3   | **Showing the other parent**    | One hop, not transitive closure: from the guardian's children, collect the _other_ guardians on those same children and list them ("Also linked: Greg — Secondary for Bob"). This surfaces step-parents and second primaries without merging unrelated families.       |
| 4   | **No auto sibling-grouping**    | Connected-component grouping over shared guardians was rejected: one grandparent or childminder listed as an additional contact on many unrelated students collapses them into a single blob family. Siblings with entirely disjoint contacts stay unlinked by design. |
| 5   | **Access**                      | **Admin only**, matching the existing guardian edit gate. New `canViewGuardians` = `admin`. Non-admins hitting `/guardians` redirect to `/students`, as the edit route already does.                                                                                   |
| 6   | **Search**                      | Client-side filter over the full list, mirroring `StudentsTable`. Under ~500 guardians this is instant and needs no server round-trip. Matches first name, last name, "Last, First", email and phone.                                                                  |
| 7   | **Leavers**                     | The family view includes inactive children, badged with the existing `LeaverBadge` — an older sibling who has left is still relevant when a parent emails. The existing `getStudentsByGuardian` (active-only) is left untouched; a new query is added instead.         |
| 8   | **Cache invalidation**          | Guardian reads are tagged `'students'`. `createGuardian` and `updateGuardian` already call `updateTag('students')`, so no new invalidation path is introduced.                                                                                                         |

---

## 1. Repo realities

| Fact (verified)                                                                                                                                               | Consequence                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/guardians/` contains only `[id]/edit/` — there is no list or detail page, and nothing links to guardians from the sidebar.                           | Two new routes: `/guardians` (list) and `/guardians/[id]` (family view). The edit route stays as-is.                             |
| `getAllGuardians` selects `id, first_name, last_name, phone` only — **no email**.                                                                             | Search-by-email is impossible today. Extend the select; this is the one query change the feature strictly requires.              |
| `getStudentsByGuardian` (`src/db/guardians.ts:76`) already `.or()`s across all four guardian slots — but filters `active = true` and returns no relationship. | Reuse the slot logic in a new `getFamilyForGuardian` that keeps leavers and returns which slot each child matched.               |
| Indexes: only `guardians_last_name_idx`. On `students`, only `primary_guardian_id` and `secondary_guardian_id` are indexed.                                   | The four-slot `.or()` seq-scans two of its four predicates. Add indexes on `additional_contact_1_id`, `additional_contact_2_id`. |
| `guardians.email` is nullable, non-unique, and has no index. De-dup is handled by the `find_guardian_matches` RPC on `lower(email)` or normalised phone.      | Add a `lower(email)` index for the list query's sort/filter; leave the de-dup RPC alone.                                         |
| `navItems` in `src/app/layout.tsx:87` gates entries with an optional `filter` fn; `PortalSidebar` maps href → icon in its own `iconMap`.                      | A nav entry needs **both** a `navItems` row with `filter: canViewGuardians` and an `iconMap` entry, or the icon silently misses. |
| `src/security.spec.ts` asserts no `@/db` or `@/auth` import in `'use client'` files, and that every `'use server'` file awaits `auth()`.                      | The table component takes data as props; all fetching stays in the server page.                                                  |
| `supabase/seed.sql` has 3 guardians, each primary for exactly one student. **No guardian is shared between two students.**                                    | The seed cannot exercise a family view at all. Add a shared-guardian sibling case, or the e2e test asserts nothing meaningful.   |
| `src/lib/mailto.ts` already has `normalizeAndDedupeEmails` and `mailtoWithBcc`.                                                                               | "Email this family" is a small reuse, not new infrastructure.                                                                    |
| Entitlement coverage is table-driven in `e2e/tests/permissions/entitlements.e2e.ts` via `ROUTE_RULES`.                                                        | Two new rows cover both new routes.                                                                                              |

---

## 2. Migration

**File:** `supabase/migrations/YYYYMMDDHHMMSS_guardian_search_indexes.sql`

```sql
CREATE INDEX IF NOT EXISTS guardians_email_lower_idx
  ON guardians (lower(email));
CREATE INDEX IF NOT EXISTS students_additional_contact_1_id_idx
  ON students (additional_contact_1_id);
CREATE INDEX IF NOT EXISTS students_additional_contact_2_id_idx
  ON students (additional_contact_2_id);
```

Mirror into `supabase/schema.sql` by hand (it is kept in sync manually), then regenerate `src/types/database.ts` via `npm run gen:types`.

---

## 3. Data layer — `src/db/guardians.ts`

**Extend `GuardianSummary` and `getAllGuardians`** to select `email` and a child count, so the list can show "3 children" and filter on email:

```ts
export type GuardianSummary = {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  child_count: number
}
```

Count via a `students!students_primary_guardian_id_fkey(count)` embed, or a second grouped query — whichever keeps one round-trip. Cache with `unstable_cache(..., { revalidate: 60, tags: ['students'] })`, matching `src/db/students.ts`.

**Add `getFamilyForGuardian(guardianId)`** returning the guardian plus their children and the one-hop co-guardians:

```ts
export type FamilyChild = {
  id: string
  first_name: string
  last_name: string
  student_code: string | null
  active: boolean
  leaving_reason: string | null
  relationship: string | null // e.g. 'Mother'
  slot: 'primary' | 'secondary' | 'additional_1' | 'additional_2'
  classes: { id: string; name: string }[]
}

export type CoGuardian = {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  links: { childId: string; childName: string; slot: FamilyChild['slot'] }[]
}
```

Two queries: children by the four-slot `.or()` (no `active` filter), then every guardian id referenced by those children's four slots minus the anchor guardian. Derive `slot` and `relationship` in TS from the returned row rather than in SQL.

Export both, plus the new types, from `src/db/index.ts`.

---

## 4. Permissions — `src/lib/permissions.ts`

```ts
export function canViewGuardians(role: StaffRole): boolean {
  return role === 'admin' // guardian list and family view — contact data for every family
}
```

Add `['canViewGuardians', canViewGuardians, ['admin']]` to the truth table in `src/lib/permissions.spec.ts`.

---

## 5. UI

### 5a. `/guardians` — list

- **`src/app/guardians/page.tsx`** (server): `auth()` → `canViewGuardians` or `redirect('/students')`; `getAllGuardians()`; `PageHeader title="Guardians"`; `EmptyState` when none.
- **`src/app/guardians/GuardiansTable.tsx`** (`'use client'`): search box + table, modelled directly on `src/app/students/StudentsTable.tsx` — same `useMemo` filter, same `TH`/`TD` classes, same mobile-stacked row treatment. Columns: Name, Phone, Email, Children (count), Actions (View / Edit). Filter matches name, "Last, First", email and phone.

Per the project rule that client components live in `src/clientComponents/`, note that the existing sibling `StudentsTable.tsx` sits beside its page instead — follow the local `src/app/students/` precedent for consistency, or relocate both. Worth a decision before implementing.

### 5b. `/guardians/[id]` — family view

**`src/app/guardians/[id]/page.tsx`** (server), gated the same way:

1. **Guardian card** — name, phone, email, occupation, address; "Edit guardian" link to the existing edit route.
2. **Children** — one row per child: name (+ `LeaverBadge` if inactive), their relationship _to this guardian_ and slot, student code, current classes, link to `/students/[id]/edit`.
3. **Also linked** — the one-hop co-guardians, each annotated with how they connect ("Secondary for Bob"), linking to that guardian's own family view. **This is the answer to the different-primary-guardians case**: open Mum, see both children, and see Dad listed as the other parent with the child he is primary for.
4. **Email this family** — `mailtoWithBcc` over the guardian's and co-guardians' emails.

Reuse `StudentDetailsModal` for a child's full detail rather than building a second detail surface; its `StudentForModal` type would need the full student select, so fetch accordingly or link out to the student page instead. Prefer linking out — it keeps the query narrow.

### 5c. Navigation

- `src/app/layout.tsx:87` — add `{ href: '/guardians', label: 'Guardians', Icon: UserCircleIcon, filter: canViewGuardians }` after Students, and import both the icon and the permission.
- `src/app/_components/PortalSidebar.tsx` — add `'/guardians': UserCircleIcon` to `iconMap` and to the import list.

---

## 6. Seed

`supabase/seed.sql` currently gives every student a distinct primary guardian, so no family has more than one child. Add the case the feature exists to serve:

- Make **Gary** (`20000000-…-0001`) the `secondary_guardian_id` of **Bob**, whose primary is Grace. Gary's family view then shows two children (Alice, Bob) with _different primary guardians_, and lists Grace as a co-guardian.
- Give the link a relationship (`secondary_guardian_relationship = 'Father'`).

Without this, the e2e test below asserts on an empty family.

---

## 7. Tests

| File                                           | Covers                                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/db/guardians.spec.ts`                     | `getAllGuardians` email/count shape; `getFamilyForGuardian` slot derivation, leaver inclusion, anchor guardian excluded from co-guardians |
| `src/lib/permissions.spec.ts`                  | `canViewGuardians` truth-table row                                                                                                        |
| `src/app/guardians/page.spec.tsx`              | admin renders; teacher/headteacher/secretary redirect to `/students`; empty state                                                         |
| `src/app/guardians/GuardiansTable.spec.tsx`    | filter by first name, last name, email, phone; no-match state                                                                             |
| `src/app/guardians/[id]/page.spec.tsx`         | children listed with relationship, leaver badged, co-guardian annotated, unknown id redirects                                             |
| `e2e/tests/permissions/entitlements.e2e.ts`    | `ROUTE_RULES` rows for `/guardians` and `/guardians/${GUARDIAN_ID}`, both admin-only, redirect `/students`                                |
| `e2e/tests/guardians/family-view.e2e.ts` (new) | admin searches "gary.alice@example.com", opens the guardian, sees Alice **and** Bob, and sees Grace as Bob's primary                      |

Follow the existing page-spec pattern: `vi.mock('@/auth')`, `vi.mock('@/db')`, `vi.mock('next/navigation')`, and mock the client table to a stub. Per repo convention, `vi.mock` only — never `jest.mock`.

---

## 8. Out of scope

- `families` / `family_id` schema, and any automatic sibling grouping (decisions 1 and 4).
- Address-based household inference — it merges unrelated families sharing a postcode.
- Editing guardian↔student links from the family view; that stays on the student edit form.
- Bulk email to a family beyond a `mailto:` link — real sending is `plans/bulk-email-functionality.md`.

---

## 9. Verification

`npm run fix:all`, then `npm run pipeline:check` (lint → format:check → type-check → test:coverage → test:e2e → build).
