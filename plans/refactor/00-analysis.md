# Refactor analysis — architecture, code quality and UX consistency

Status: analysis (no code changed). Produced from a full read of the codebase on 2026-09-19,
revised with product-owner constraints the same day.

> This is the evidence and reasoning behind the programme. The deliverable plans for coding agents
> are the numbered files in this folder; start at [README.md](README.md). Item codes below (A1, B2,
> D0 …) are referenced from each plan's header.

Priorities used throughout: **easy to read and maintain** first, then reuse over per-screen variants,
then correct placement of logic (DB / server / client) for the hosting model. Raw execution
efficiency matters only where the user feels it — which, for this product, is on a teacher's phone.

## Constraints from the product owner

These shape every recommendation below.

1. **Teachers use the portal on mobile, often on poor signal.** Page load and save feedback must feel
   fast. On a weak connection the client↔server round-trip (500 ms–2 s) dominates everything, so the
   levers that matter are: fewer round-trips per interaction, less JavaScript shipped, streaming with
   skeletons, instant local feedback on save, and not re-fetching the page after a save when the
   browser already has the state. Server-side DB latency matters too, but only via time-to-first-byte.
2. **Prefer application-layer logic over SQL.** The team doesn't have SQL depth; PL/pgSQL functions
   are the hardest code in the repo to read, test and debug. The plan should reduce SQL, not add
   views/RPCs.
3. **Photo opt-out stays.** It's a required feature.
4. **Push notifications stay.** They're liked.

## How to read the ratings

Each item is rated 0–10 on **how much it improves** that dimension (10 = transformational,
1 = marginal). Ratings are relative to this codebase, not absolute.

| Column           | Meaning                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| **Complexity**   | Reduction in lines, branches, concepts and copy-paste a maintainer has to hold in their head                |
| **Reuse**        | How much duplicated per-screen code collapses into one shared implementation                                |
| **Architecture** | Better placement of logic across DB → server → client, fewer moving parts in the hosting/caching/auth model |

`Size` is effort: **S** ≤ 1 day, **M** 2–4 days, **L** a week+.

---

## 1. Current-state snapshot

Numbers are from the non-test source (`src/**`, ~26.6k lines; tests are another ~32k).

**Stack / hosting.** Next.js 16 App Router on Netlify (`@netlify/plugin-nextjs`), every authenticated
page is dynamic SSR in a Node serverless function. Supabase Postgres accessed **only** from the server
with the service-role key (`src/db/client.ts`); there is no browser Supabase client and no RLS
policies — RLS is enabled with zero policies, which is a "deny anything that isn't service-role"
kill-switch, not an authorisation model. Auth is NextAuth v5 + Entra ID; role lives on the `staff` row
and is copied into the JWT. `supabase-js` is used purely as a PostgREST HTTP client — no Supabase
Auth, Storage or Realtime.

**Where the duplication is.**

| Signal                                                                                       | Count                                                                                                       |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `await auth()` call sites                                                                    | 72 in 57 files                                                                                              |
| `'Not authenticated'` / `'Not authorised'` string literals                                   | 51                                                                                                          |
| Locally defined `Field` / `Section` / `TextField` / `Checkbox` form helpers (near-identical) | 27 functions across 13 files                                                                                |
| Server actions following the same 25-line preamble                                           | ~25 actions in 20 `actions.ts` files, no shared wrapper                                                     |
| `notFound()` usage                                                                           | 0 — every missing entity `redirect()`s to a list                                                            |
| `error.tsx` / `not-found.tsx`                                                                | none                                                                                                        |
| Tab-bar implementations                                                                      | 4 (`AdminTabBar`, `FinanceTabBar`, `RegistrationTabs`, Incidents pills)                                     |
| Table systems                                                                                | `SimpleGrid` (RSC) + `FunctionalGrid` (TanStack) + 5 hand-rolled tables                                     |
| Cache invalidation mechanisms                                                                | `unstable_cache` 60s + `updateTag` in `src/db` + `revalidatePath` in actions + manual "Refresh data" button |

**Biggest single duplications.**

- `AddStudentForm.tsx` (462) and `EditStudentForm.tsx` (703) are the same form twice, each carrying its
  own copy of `Field`, `FormSection`, `GuardianSelector`, `GuardianFields`, `filterGuardians`.
- `students/new/actions.ts` and `students/[id]/edit/actions.ts` share ~120 identical lines including
  a verbatim copy of `resolveGuardian`.
- `registrations/actions.ts` and `registrations/photo-opt-out-actions.ts` are the same three
  actions (apply / reject / delete) with different nouns; `RejectDialog` and `RejectOptOutDialog`
  differ by ~30 lines after renaming.
- `layout.tsx` and `PortalSidebar.tsx` both hold the nav → icon mapping.

**Why there is so much SQL.** 16 Postgres functions, ~650 lines of PL/pgSQL. The large ones
(`approve_registration` ~220 lines, `migrate_class` ~120, `set_enrolments` ~70, `save_fee_plan` ~50)
are multi-table writes that must be atomic. They live in SQL for one reason: **`supabase-js` /
PostgREST has no transactions**, so the only way to make "insert student + update guardians + insert
enrolment + mark submission" all-or-nothing is a database function. Around them sit duplicated rules
in TS and SQL (`is_class_open` ↔ `lib/classes.ts`, `today_london()` ↔ `todayInSchoolTz()`, the
guardian-match rule in `approve_registration` ↔ `find_guardian_matches` ↔ `guardianDiff.ts`),
`GRANT ALL … TO anon, authenticated` on every table that nothing uses, and an `rls_auto_enable`
event-trigger for a security model the app doesn't have. The data layer also has three sources of
truth for the schema: hand-written migrations, a generated `schema.sql` snapshot, and a generated
`types/database.ts`.

**Where the app does work the database should do — or vice versa.** Several reads fetch whole
tables and aggregate in JS: `getGuardianChildCounts` pages every student to count guardian slots;
`getStudentsByTeacher` is a 3-round-trip chain (classes → student_classes → students);
`getStudentFeeList` / `getPriorYearBalances` load every student, enrolment, account and payment then
join with `Map`s; dashboard and reports load every attendance and enrolment row for a range and
reduce in `lib/attendanceSummary.ts`. Each is 30–80 lines of JS that a single typed join/aggregate
query would replace — that doesn't require SQL views if the query layer can express joins in TS
(see D0).

**UX inconsistencies a user would notice.**

- Headers: six list pages use `PageHeader`; every other page (and every new/edit page) has an
  inline `<h1>`. `reports/page.tsx` defines its own private `PageHeader`.
- Missing record → silently redirected to the list, no message.
- Validation: only the _first_ Zod issue is shown, as one red line next to the Save button. No
  field-level errors anywhere.
- Viewing an entity: students → modal (`StudentDetailsModal`, 386 lines, no `/students/[id]`);
  lesson plans → a different modal; guardians / classes / registrations / finance → pages.
- Tabs: three near-identical grey pill bars plus a fourth blue-pill style on Incidents.
- "Refresh data" button in the sidebar exists because the 60-second cache sometimes shows stale
  data after a save (PR #27); the E2E fixture `loadWithFreshData` has to click it.
- `/timetables` is an orphaned page: not in the nav, nothing links to it, read-only with a disabled
  "Add slot" button and no write path. It came across from the original repo migration.

**What mobile teachers hit today.** After every save, the action calls `revalidatePath`, which makes
the browser re-fetch the whole page's RSC payload even when the form already holds the new state
(attendance register, staff sign-in). Most CRUD saves then `redirect()` to a list — a second full
round-trip. `FunctionalGrid` ships TanStack Table to the client on every list that uses it; the
attendance page also ships the 386-line student modal. Netlify functions default to `us-east-1`; if
Supabase is in the EU, every DB query inside a page is a transatlantic hop, and the dashboard makes
eight of them.

---

## 2. Improvement items

Grouped by theme. Items are distinct; dependencies are noted. Ratings are Complexity / Reuse /
Architecture.

### A. Cross-cutting foundations (do these first — everything else builds on them)

#### A1. `requireSession()` / `requireRole()` and a single server-action wrapper

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **9**    | **9** |    **7**     |  M   |

**Problem.** 72 `await auth()` sites; four different reactions to "no session" (`redirect('/login')`,
`redirect('/dashboard')`, `return { error }`, or nothing — relying on the proxy and then
dereferencing `staffId!`). Every action repeats: auth → role check → `extractFormFields` →
`safeParse` → `try { db; logAuditEvent; revalidate } catch { console.error; return friendly error }`
→ `redirect`. `createIncidentAction` checks only the session while `updateIncidentAction` checks
`canEditIncidents` — an inconsistency that the boilerplate makes easy to miss.

**Approach.**

- `src/auth/require.ts`: `requireSession()` (redirects to `/login`) and `requireRole(canX)` (redirects
  to `/dashboard` or throws `notFound()`); both return `{ role, staffId, session }` typed non-null.
- `src/lib/action.ts`: `defineAction({ permission, schema, run, audit, redirectTo })` that owns the
  whole preamble/epilogue, so an action file becomes the 10–20 lines of domain logic. Field-level
  errors (B3) plug in here. Audit logging (D6) happens here.
- Rewrite `security.spec.ts` to assert "imports `requireSession`/`defineAction`" rather than the
  string `await auth()`.

**Touches.** All `actions.ts`, all `page.tsx`, `security.spec.ts`. Removes ~1,000 lines net.

#### A2. One route/permission/nav configuration

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **7**    | **8** |    **8**     | S–M  |

**Problem.** Route gating lives in three places that must agree by hand: `proxy.ts` hard-gates only
`/reports`, `/finance`, `/hr`; `layout.tsx` `navItems[].filter` hides nav; each page re-checks with
`canX`. `/admin`, `/registrations`, `/guardians`, `/staff/new`, all edit routes are page-gated only.
`PortalSidebar.tsx` duplicates the icon map from `layout.tsx`.

**Approach.** `src/lib/routes.ts` exporting `[{ href, label, icon, permission?: (role) => boolean }]`.
`proxy.ts` derives its gate from it (prefix match), `layout.tsx` and `PortalSidebar.tsx` render from
it, and `requireRole` (A1) can look up the permission for the current path. Delete the duplicate icon
map.

#### A3. Standard page behaviours: header, not-found, error, loading

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **6**    | **6** |    **5**     |  S   |

**Problem.** See snapshot. Also `loading.tsx` exists for 14 segments but not finance, hr, guardians
or any new/edit route — on a slow connection those routes show nothing until the server responds.

**Approach.** Use `PageHeader` (extend it with `subtitle`, `backHref`, `action`) on every page and
delete the private copy in `reports/page.tsx`. Replace every "entity missing → `redirect(list)`"
with `notFound()` and add one root `not-found.tsx` and `error.tsx`. Add the missing `loading.tsx`
files using the existing `TableSkeleton`. This is also mobile item G3.

#### A4. Validated environment module

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **4**    | **3** |    **6**     |  S   |

**Problem.** Nine `process.env.X!` assertions scattered across `auth/config.ts`, `db/client.ts`,
`lib/push.ts`, `layout.tsx`, two client components; `env.d.ts` omits the Turnstile variables that
`.env.local.example` documents. A misconfigured deploy fails at first request, not at boot.

**Approach.** `src/env.ts` with a Zod schema (server + `NEXT_PUBLIC_` client split), parsed once;
everything imports from it. Delete `env.d.ts`.

#### A5. One error/logging helper

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **3**    | **4** |    **4**     |  S   |

**Problem.** ~30 ad-hoc `console.error('[someAction] error:', err)` plus a second log inside
`getUserFriendlyDbError`, so DB errors log twice. No structured context.

**Approach.** `logError(scope, err, context?)` used by A1's wrapper; `getUserFriendlyDbError` stops
logging. Folds into A1 naturally.

### G. Mobile speed and save feedback (teacher-facing screens first)

The teacher's daily screens are Dashboard, Attendance, Lesson plans, Incidents, Staff sign-in, and
the Students / Classes lists. Everything here targets those.

#### G1. Co-locate the Netlify function region with the Supabase region

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **2**    | **1** |    **8**     |  S   |

**Problem.** `plans/update-edge-functions.md` records that Netlify functions default to `us-east-1`.
If the Supabase project is in the EU (likely — check the dashboard), every page render is
phone → Netlify (US) → Supabase (EU) → back, once per query. The dashboard makes 8 queries, so even
in parallel it pays a ~100 ms transatlantic hop before the first byte reaches the phone.

**Approach.** Check both regions. Set the Netlify functions region to the EU (a site setting on paid
plans) or move the Supabase project. This is the single largest TTFB lever and costs no code. It also
settles the caching question (D1): with co-located regions a query costs 5–20 ms and the
per-query cache buys nothing.

#### G2. Don't re-fetch the page after a save the browser already knows about

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **5**    | **4** |    **7**     |  S   |

**Problem.** `saveAttendanceAction` and the staff sign-in/out actions end with
`revalidatePath(...)`. In a server action that also tells the Next router to re-fetch the current
route's RSC payload — on a weak signal that's a second multi-second wait _after_ the "Register saved"
message, and the page can visibly re-render under the teacher. The form already has the new state.

**Approach.** For stay-on-page saves (attendance, staff sign-in, fees, payments) return the saved
row and update local state; do not call `revalidatePath`. With D1 (no server cache) there is nothing
to invalidate anyway. Use `useOptimistic` on the attendance status buttons and the sign-in row so the
tap is reflected instantly and rolled back on error. For CRUD saves that `redirect()` to a list,
prefer redirecting to the entity's view page (C4) — one small page rather than a full list.

#### G3. Streaming and skeletons everywhere

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **3**    | **5** |    **5**     |  S   |

Attendance already wraps the register in `Suspense` with a skeleton — the right pattern. Extend it:
`loading.tsx` on every segment (A3), and wrap the slow half of composite pages (dashboard stats,
class register + enrolment history) in `Suspense` so the header and nav paint immediately from the
PWA shell while data streams in.

#### G4. Ship less JavaScript to teacher screens

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **4**    | **3** |    **6**     |  S   |

**Problem.** `FunctionalGrid` pulls TanStack Table into the bundle of every list that uses it.
The attendance page ships the 386-line `StudentDetailsModal`. `IncidentsClient` / `LessonPlansClient`
are large client components that only filter a list.

**Approach.** Rule: teacher-facing lists use `SimpleGrid` (zero client JS) unless search is needed
for the data volume; `FunctionalGrid` for admin lists (students, guardians, registrations, fees).
Incidents and Lesson plans become server pages (C1). The student modal on the attendance page becomes
a link to `/students/[id]` (C4). Check bundle size per route with `next build`'s output before/after.

#### G5. PWA shell that actually helps on poor signal

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **3**    | **2** |    **6**     |  M   |

Push notifications stay (E1). The service worker already precaches the offline page and is
network-only for HTML (correctly — student data must not be cached in the browser without thought).
Cheap wins that fit that constraint: precache the app shell (CSS, fonts, JS chunks) so navigation
only waits on the RSC payload; add an `OfflineBanner` using `navigator.onLine` so a failed save says
"you're offline" rather than a generic error. The larger read-only-offline idea in
`plans/offline-read-only-mode.md` is worth revisiting **after** G1–G4 — it may not be needed.

### B. Forms

#### B1. Shared form kit

| Complexity | Reuse  | Architecture | Size |
| :--------: | :----: | :----------: | :--: |
|   **8**    | **10** |    **4**     |  M   |

**Problem.** 27 local copies of `Field`/`TextField`/`SelectField`/`CheckboxField`/`TextArea`/
`Section`/`FormSection` across 13 files, all rendering the same Tailwind label+input markup. Finance
forms use `LABEL`/`INPUT` string constants instead. Every form also hand-rolls the same
`useState(error)` + `useTransition` + `handleSubmit` + Save/Cancel/error footer.

**Approach.** `src/components/form/`: `TextField`, `SelectField`, `CheckboxField`, `TextArea`,
`DateField`, `FormSection`, `FormActions` (submit label, pending state, cancel href, form-level
error), and a `useServerForm(action)` hook that wraps the transition and result handling. Delete
all 27 local copies. Field-level error display (B3) is designed in from the start (`error` prop).
Inputs default to `inputMode`/`autoComplete` attributes appropriate for mobile keyboards.

#### B2. Merge Add/Edit forms and actions per entity

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **9**    | **9** |    **5**     |  M   |

**Problem.** `ClassForm`, `FeePlanForm` and `AcademicYearForm` already follow the right pattern (one
form, `initial?` + `action` + `submitLabel`). Student (462 + 703 lines), Staff (130 + 175), Incident
(286 + 172) and Lesson plan (123 + 96) each have two forms. The two student actions share ~120
identical lines.

**Approach.** One `StudentForm` with `initial?: Student`, one `saveStudentAction(id | null, formData)`.
Extract `GuardianSelector` + `GuardianFields` to `src/components/form/GuardianPicker.tsx` (it's also
what `RegistrationReview` needs). Same for Staff, Incident, Lesson plan. Depends on B1.

#### B3. Field-level validation errors

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **5**    | **6** |    **4**     |  S   |

**Problem.** `ActionResult = { error: string } | void`; actions return
`parsed.error.issues[0].message`. On a 30-field student form the user gets "Required" with no
indication of which field — on a phone that means scrolling the whole form looking for it.

**Approach.** `ActionResult = { error?: string; fieldErrors?: Record<string, string> }`; A1's wrapper
produces `fieldErrors` from `z.flattenError`. B1 fields accept `error` and the form scrolls the first
errored field into view. HTML `required` stays as the first line of defence (no round-trip).

### C. Tables, lists and navigation chrome

#### C1. All lists on `SimpleGrid` / `FunctionalGrid`; filters in the URL

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **7**    | **8** |    **6**     |  M   |

**Problem.** `IncidentsClient` (249), `LessonPlansClient` (294), `AcademicYearsTable` (108) and
`StaffAttendanceTable` (226) each hand-roll mobile cards + desktop table from the primitives.
Incidents fetches 50 rows then filters by tab in the browser with `router.replace`; Registrations
does the same filter server-side from `searchParams`.

**Approach.** Incidents and Lesson plans become RSC pages: `?type=` / `?class=` read from
`searchParams`, filtered in the query, rendered with `SimpleGrid`. `AcademicYearsTable` inline-edit →
`SimpleGrid` + edit route (consistency with every other entity). `StaffAttendanceTable` keeps its
interactive rows but on `FunctionalGrid` columns. The two grids are a reasonable pair (zero-JS vs
interactive) — keep both, just make them the only two, and apply the G4 rule for which to use.

#### C2. One `TabBar`

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **4**    | **7** |    **2**     |  S   |

`AdminTabBar`, `FinanceTabBar`, `RegistrationTabs` are copy-paste; Incidents uses a fourth style.
Replace with `<TabBar tabs=[{href,label,count?}] />` driven by the current path/searchParam.

#### C3. Shared row/header actions with the "no permission" affordance

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **4**    | **7** |    **2**     |  S   |

The "Edit link, or greyed-out Edit with a Tooltip if you can see but not edit, or nothing" logic is
implemented in `EditAction` (used by 2 tables), `StudentsTable.EditLink`, inline in
`IncidentsClient`/`LessonPlansClient`, and for the Add button in three list pages. One
`PermissionedLink` (+ `PageHeader action`) replaces all of them.

#### C4. One convention for viewing an entity

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **6**    | **5** |    **5**     |  M   |

**Problem.** Students have no view page — a 386-line `StudentDetailsModal` is opened from
`StudentsTable` and `AttendanceForm`. Lesson plans have a different in-list details modal.
Guardians/classes/registrations/finance have pages. Modals can't be linked, printed, or reached from
the guardian family view, and they ship their JS to every page that might open them.

**Approach.** Add `/students/[id]` (server component, reusing the same sections as the modal) and
`/lesson-plans/[id]`; the modal becomes a link. Deletes ~500 lines of client code and makes every
entity follow list → view → edit. Pairs with A3's `notFound()` and G4.

#### C5. Name / person formatting helper

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **3**    | **6** |    **1**     |  S   |

`last, first` and `first last` are composed inline in ~40 places; staff `display_name` fallback logic
is repeated. `personName(p, 'lastFirst' | 'firstLast')` in `src/lib/format.ts` next to `formatGbp`
and the datetime helpers.

### D. Data layer, SQL and caching

#### D0. Replace `supabase-js` with a TypeScript query layer that has transactions (Drizzle ORM)

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **8**    | **6** |    **9**     |  L   |

**This is the item that answers "less SQL".** The PL/pgSQL exists because PostgREST can't do
transactions. Give the server a real Postgres connection with transactions and the reason
disappears: every RPC becomes an ordinary async TypeScript function inside `db.transaction(async
(tx) => { … })`, readable, unit-testable, debuggable with a breakpoint.

**Why Drizzle specifically.** Supabase documents it as a first-class option; it runs on Netlify's
Node functions through the Supavisor transaction pooler (port 6543, `postgres` driver with
`prepare: false`); the schema is declared in TypeScript (`drizzle/schema.ts`) and `drizzle-kit
generate` writes the migration SQL for you — so the hand-written migrations, the `schema.sql`
snapshot and the generated `types/database.ts` collapse into one TS file that is also the type
source. Queries are typed TS (`db.select().from(students).innerJoin(...)`, `count()`, `sum()`),
which replaces the PostgREST embed DSL (`guardians!students_primary_guardian_id_fkey(...)`, 16 uses)
with something the compiler checks. Prisma is the alternative; it's heavier on serverless and
more abstract. Kysely is a query builder without schema-as-code. Drizzle fits best.

**What moves to TS.** All 16 functions become `src/db/*.ts` service functions:

| Today (PL/pgSQL)                                                                | Tomorrow (TS, in a transaction)                                                     |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `approve_registration` (220 lines, JSON diff arrays in SQL)                     | `approveRegistration()` ~120 lines; diff computed with plain object comparison      |
| `migrate_class`, `set_enrolments`, `close_enrolments`, `mark_student_as_leaver` | `enrolments.ts` — one module, one `isClassOpen`, one `today` (passed in)            |
| `save_fee_plan`                                                                 | `saveFeePlan()` — insert/update + replace links                                     |
| `apply_photo_opt_out`, `create_registration_submission`                         | trivial                                                                             |
| `find_guardian_matches`, `find_student_matches`                                 | typed `where` clauses; the match rule lives **once** and `guardianDiff.ts` calls it |
| `set_current_academic_year`                                                     | two-statement transaction                                                           |
| `today_london`                                                                  | gone — TS passes the date                                                           |
| `set_updated_at` trigger                                                        | Drizzle `.$onUpdate(() => new Date())` column default                               |
| `prevent_class_academic_year_change` trigger, `rls_auto_enable`                 | drop; enforce in `updateClass()` (never writes that column) / not needed            |

**What stays in the database.** Tables, primary/foreign keys, `CHECK` constraints, unique indexes
(`student_classes_one_open`, `academic_years_one_current`) — these are declarative, one line each in
the Drizzle schema, and they're the last line of defence against bugs in the TS. That's the right
amount of SQL for a team without SQL depth: **data shape and integrity in the schema, all behaviour
in TypeScript.**

**Migration path (incremental, each step shippable).**

1. Add Drizzle alongside `supabase-js`; point it at the same DB; introspect once with
   `drizzle-kit pull` to bootstrap `schema.ts`.
2. Move reads module by module (start with `timetable.ts`/`staff.ts`, end with `students.ts`).
   Each move deletes an embed string and a hand-written row type (D2 happens for free).
3. Move the small RPCs (`apply_photo_opt_out`, `set_current_academic_year`, `mark_student_as_leaver`,
   `save_fee_plan`) into transactions; drop each SQL function in the same migration.
4. Move `set_enrolments`/`migrate_class`, then `approve_registration` last.
5. Remove `supabase-js`, `types/database.ts`, `schema.sql`; keep the Supabase CLI only for local
   Postgres and applying `drizzle-kit`-generated migrations (or switch to `drizzle-kit migrate`).

**Tests.** `src/db/*.spec.ts` currently mock the supabase-js chain; with Drizzle they can run against
the local Postgres the E2E suite already starts — real tests of real transactions, and simpler to
write.

**If D0 is not adopted**, the RPCs must stay (they are the transaction boundary) and D3/D5 fall back
to their "keep SQL, tidy it" variants noted inline.

#### D1. Remove the per-query application cache

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **8**    | **5** |    **9**     |  M   |

**Problem.** Reads in `src/db` are wrapped in `unstable_cache(…, { revalidate: 60, tags })` (35
wrappers across 10 files). Writes call `updateTag` in `src/db` _and_ actions call `revalidatePath`
(45 calls) — two invalidation systems for the same data. Because they don't always agree there is a
manual "Refresh data" button in the sidebar (`revalidateAllCaches` bumps 7 tags) and the E2E
fixture has to click it. Half the DB modules (attendance, incidents, lesson-plans, staff-attendance,
push) aren't cached at all, so coverage is arbitrary. Critically for mobile, **the cache does nothing
for the phone's round-trip** — it only shaves DB time off TTFB — while it directly causes the
"I saved but the list didn't change" experience and the extra `revalidatePath` refetch (G2).

**Approach.** Do G1 first. With co-located regions, delete every `unstable_cache`, `updateTag`,
`revalidatePath`, `revalidateAllCaches` and the Refresh button; pages are already dynamic and simply
read fresh data. If G1 turns out to be impossible and DB hops stay transatlantic, keep a cache but
in **one** place: `'use cache'` at the page-segment level for admin read-mostly screens (reports,
guardians), invalidated by tag from the action wrapper — never per query, never from two layers.

#### D2. Consistent read-error policy and generated row types

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **6**    | **5** |    **7**     |  S   |

**Problem.** 27 reads do `const { data } = await …; return data ?? []` — a failing query renders an
empty table with no error; 25 others `throw`. ~12 row types (`IncidentRow`, `LessonPlanRow`,
`StaffAttendanceRow`, `StudentInsert`, `GuardianInsert`, `ClassInsert`, …) are hand-typed despite
`Tables<>` / `TablesInsert<>` existing in `types/database.ts`.

**Approach.** With D0 both problems vanish (Drizzle throws; types come from the schema). Without D0:
a tiny `one(q)` / `many(q)` helper in `src/db/client.ts` that throws on error, and `Tables<'x'>` /
`TablesInsert<'x'>` instead of hand-written types.

#### D3. One query instead of fetch-then-aggregate

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **6**    | **5** |    **8**     |  M   |

Each case below replaces 30–80 lines of JS `Map`-joining with one typed query. With D0 these are
Drizzle joins/aggregates written in TS — no SQL views needed. (Without D0 they'd be views, which is
why this item was originally "SQL views"; that's the fallback, not the recommendation.)

| Today                                                                                        | Replace with                                                                                               |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `getGuardianChildCounts` pages all students, counts 4 guardian slots in JS                   | one `select guardian_id, count(*) … group by` over a union of the four slot columns                        |
| `getStudentsByTeacher` / `getStudentIdsByTeacher`: classes → stays → students, 3 round-trips | one `innerJoin` students ← student_classes ← classes where teacher_id = ?                                  |
| `getFeePlans` loads **all** `fee_plan_classes` then filters                                  | filter in the query                                                                                        |
| `getStudentFeeList` joins students + enrolments + accounts + paged payments with `Map`s      | one query with `sum(payments.amount)` grouped per student/year; fee **status** rules stay in `lib/fees.ts` |
| `getPriorYearBalances` calls `getStudentFeeList` once **per prior year**                     | the same grouped query over all years                                                                      |
| Dashboard: 8 parallel calls incl. full attendance + enrolment rows for today                 | one `dashboardStats(date)` function with `count()` aggregates, run in one round-trip                       |
| Reports: all attendance + enrolment + staff-attendance rows for a range, reduced in JS       | grouped daily counts; keep `attendanceSummary.ts` only for what genuinely needs per-student rules          |

Business rules stay in TS: `lib/fees.ts` (status, instalments) and `lib/enrolment.ts` (roster on a
date) are tested logic and belong in the application layer.

#### D4. Collapse near-duplicate query families

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **6**    | **7** |    **6**     |  S   |

`getAllStaff` / `getAllStaffWithClasses` / `getTeachers` → `getStaff({ roles?, withClasses? })`.
`getStaffAttendanceForToday` / `getStaffAttendanceByDate` → `getStaffAttendance({ date, staffId? })`.
`getAllStudents(includeInactive)` / `getStudentsForList` / `getStudentsByIds` / `getStudentsByClass`
→ `getStudents({ active?, ids?, classId?, teacherId?, select: 'list' | 'full' })`. Fold `timetable.ts`
into `classes.ts` — or delete it with E4. The `index.ts` barrel shrinks accordingly.

#### D5. Tidy what's left in the database

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **5**    | **3** |    **7**     |  S   |

After D0 the database holds tables, constraints and indexes. Finish the job:

- Revoke `ALL ON TABLE … FROM anon, authenticated` (a ~40-line migration); drop `rls_auto_enable`;
  keep RLS enabled with no policies as the kill-switch.
- Write a 15-line `supabase/README.md`: _server-only access, one connection, authorisation in
  `lib/permissions.ts`, schema in `drizzle/schema.ts`, behaviour in `src/db/*.ts`_.
- Archive `supabase/scripts/verify_enrolment_history.sql` once the enrolment module has TS tests.

Without D0 (fallback): keep the RPCs; make `approve_registration` call `find_guardian_matches` so the
match rule exists once; declare composite return types instead of `json`; add the README anyway.

#### D6. Audit logging from one place

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **4**    | **5** |    **5**     |  S   |

`logAuditEvent` is called by hand in each action; `audit-redaction.ts` is applied only in the HR
action; guardians created inside a student save are not audited as their own entity. With A1,
`defineAction({ audit: { entity, action } })` logs once, redacts by a shared denylist, and it becomes
impossible to forget. With D0 the audit insert can join the same transaction as the write.

### E. Feature-level simplification

#### E1. Keep push notifications; make them cheaper to own and more useful

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **4**    | **4** |    **3**     |  S   |

Notifications stay. Today ~775 lines send exactly one message ("attendance saved" → admins and
headteachers). Two changes make the cost worth it:

- **More triggers, same plumbing.** New registration submitted, new photo opt-out request, incident
  recorded — each is one `notify(roles, payload)` call from the A1 action wrapper. The plumbing is
  already generic; only the call sites are missing.
- **One component.** `NotificationToggle` (120) and `NotificationBanner` (76) share the
  subscribe/permission logic; merge into `NotificationPrompt` with a `variant`. Move the push send
  into `defineAction({ notify })` so it's declarative and never blocks the response.

#### E2. Keep photo opt-out; make it share the registrations review

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **7**    | **8** |    **4**     |  M   |

Photo opt-out stays. It currently duplicates the registration flow almost line for line:
`RejectDialog` ≈ `RejectOptOutDialog` (84 lines each, ~30 lines differ after renaming), `ApproveDialog`
(266) ≈ `ApplyOptOutDialog` (167), `registrations/actions.ts` ≈ `photo-opt-out-actions.ts`, and both
have list sections, status badges, delete buttons and matching pickers.

**Approach.** One `ReviewRequestDialog` / `RejectRequestDialog` / `DeleteRequestButton` parameterised
by a small `RequestKind` (`'registration' | 'photoOptOut'`) that supplies labels, the match function
and the apply action. Actions collapse into three (`applyRequest`, `rejectRequest`, `deleteRequest`)
via A1. The public forms (`RegistrationForm`, `PhotoOptOutForm`) share B1's kit. Tables stay
separate — they hold different data — but the ~950 lines of review UI become ~400.

#### E3. Simplify class migration to "roll over class"

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **6**    | **4** |    **4**     |  M   |

The wizard (`ClassMigrationForm` 337 + tab 106 + actions 95 + `migrate_class` 120 lines) asks the
admin to pick move/none/left/graduated/transferred for every student and validates that the roster
hasn't changed since the form loaded. Leavers already have a first-class flow (`LeaverSection` on
the student edit page, `mark_student_as_leaver`). A simpler model: "Roll over" creates next year's
class with the same roster and closes this one; admins then remove individual students via the
existing student/class edit forms. The logic shrinks to ~30 lines of TS (with D0) and the wizard to a
confirm dialog. Trade-off: one extra step per leaver at year end. Product decision.

#### E4. Remove the orphaned Timetables page and table

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **4**    | **2** |    **4**     |  S   |

`/timetables` is not in the nav, nothing links to it, and it was carried over from the original
repo. It renders `timetable_slots` read-only with a permanently disabled "Add slot" button; there is
no write path, no form, no action. Remove `src/app/timetables/`, `src/db/timetable.ts`,
`canEditTimetables`, the `timetable_slots` table and its seed rows, and the row in `PERMISSIONS.md`.
If timetables are wanted later, build them properly on B1/B2 against the class edit page.

#### E5. One email dropdown

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **4**    | **6** |    **2**     |  S   |

`BulkEmailDropdown` (109) and `StaffEmailDropdown` (187) do the same thing (copy addresses / open
mailto with BCC) with different props. One component, one Headless UI `Menu`.

### F. Tests and tooling

#### F1. Make tests refactor-tolerant

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **5**    | **3** |    **3**     |  M   |

61 specs `vi.mock('@/db')` by function name; action specs assert exact `revalidatePath` argument
lists; `security.spec.ts` string-matches `await auth()`; `src/db/*.spec.ts` mock the supabase-js
call chain. Every item above will break dozens of tests for reasons unrelated to behaviour. Do this
alongside A1/D0/D1: assert on outcomes (what was written, where the user ended up) rather than on
which cache tag was bumped; move the security checks to import-based assertions; run `src/db` tests
against the local Postgres; where a page test only checks "calls `getX` then renders", replace with a
Playwright check or delete.

#### F2. Trim dependencies

| Complexity | Reuse | Architecture | Size |
| :--------: | :---: | :----------: | :--: |
|   **2**    | **1** |    **3**     |  S   |

With D0: remove `@supabase/supabase-js`; add `drizzle-orm`, `postgres`, `drizzle-kit`. `web-push`
stays (E1). `@headlessui/react` is imported by 6 files; E2 and E5 reduce that to 3 — keep it.

---

## 3. Things deliberately **not** proposed

- **Adopting Supabase Auth / real RLS policies.** It would be a different product architecture
  (browser clients, JWT claims for roles) and would push authorisation _into_ SQL — the opposite of
  constraint 2. The current server-only model is simpler and correct for a staff-only tool.
- **Replacing the two-grid design.** `SimpleGrid` (RSC) + `FunctionalGrid` (TanStack) is a sound
  split; C1 only insists everything uses one of them and G4 says which.
- **Rewriting the enrolment-history model.** Dated `student_classes` rows are the right model for
  registers and reports. D0 moves its _behaviour_ to TS; the table stays.
- **Putting fee-status or register-roster rules anywhere but TS.** They are business rules with
  tests. D3 only moves joins and sums into the query.
- **Client-side caching of student data for offline use.** Not until G1–G4 have landed and been
  measured on a real phone; the privacy trade-off needs a deliberate decision.
- **Moving `scripts/m365-sync` out of the repo.** It's ops tooling coupled to this schema; it just
  shouldn't be imported by the app (it isn't). Its `contacts.sql` would be the one remaining
  hand-written SQL after D0 — acceptable for a one-off export script.

---

## 4. Suggested sequencing

Ordered so each phase leaves the app shippable and makes the next one smaller.

| Phase | Items                    | Why this order                                                                                                                             |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | G1, E4, decide E3 and D0 | Region check is free and settles D1. Timetables removal is trivial. D0 is the big architectural call — decide it before touching `src/db`. |
| 1     | A1, A5, D6, F1           | Action wrapper + auth helpers. Touches every action; change the test conventions at the same time.                                         |
| 2     | D1, G2, G3               | Remove the cache, stop refetching after save, skeletons everywhere. Immediate mobile win; unblocks removing 45 `revalidatePath`s.          |
| 3     | B1, B3, B2               | Form kit, field errors, then merge Add/Edit forms on top of it.                                                                            |
| 4     | A2, A3, C2, C3, C5       | Chrome consistency: routes config, headers, not-found, tabs, actions, names.                                                               |
| 5     | C1, C4, G4, E2, E1       | Lists onto the grids; entity view pages; less client JS; unify the review flows; broaden notifications.                                    |
| 6     | D0 → D2, D3, D4, D5      | Query layer swap, module by module; the RPCs move to TS last. Nothing above depends on it, so it can run in parallel with 3–5 if staffed.  |
| 7     | E3, E5, F2, G5           | Optional simplifications once everything else is stable.                                                                                   |

Rough net effect if A–D land: roughly 5–7k fewer source lines, ~650 lines of PL/pgSQL gone, one
form system, one action pattern, one auth helper, one route config, one schema source, two grids,
zero cache layers, and every screen following list → view → edit with the same header, tabs, errors
and empty states — with teacher screens that paint a skeleton immediately and confirm a save without
re-downloading the page.
