# 06 — Routes config, page shell, environment module

| Delivers       | Cx  | Reuse | Arch | Size | Depends on |
| -------------- | :-: | :---: | :--: | :--: | ---------- |
| A2, A3, A4, G3 |  7  |   7   |  8   |  M   | 02         |

## Goal

Three related consistency fixes that all touch "the shell around a page":

1. **One route configuration** feeding the proxy, the sidebar (both the server layout and the client
   `PortalSidebar`, which currently duplicate the icon map) and `requireRole`.
2. **Standard page behaviours:** every page uses `PageHeader`; a missing record is `notFound()`, not a
   silent redirect; root `not-found.tsx` and `error.tsx` exist; every route segment has a
   `loading.tsx`; slow parts of composite pages stream behind `Suspense`.
3. **Validated environment** in one module; no `process.env.X!` anywhere else.

## Decisions already made

- `src/lib/routes.ts` is a plain array; icons are referenced by **name** (string key into a map in
  the client sidebar) so the array can be imported from both server and client code without
  passing component references across the boundary.
- Proxy gating becomes **prefix-based for every route with a `permission`**, not just
  reports/finance/hr. Pages keep their `requireRole` call as defence in depth (proxy → page → action).
- Missing entity → `notFound()` everywhere. The current "redirect to the list" behaviour is
  replaced; this is a deliberate UX change (a 404 page with a "Back to X" link is clearer than a
  silent list).
- `error.tsx` is a client component with the standard `reset()` button and a link to `/dashboard`;
  it logs via `console.error` only (client side).
- Env: Zod schema, parsed at module load, `server` and `client` objects. Client code imports only
  `env.client`. No `@t3-oss/env-nextjs` — write the ~40 lines by hand.

## API

```ts
// src/lib/routes.ts
export type IconName =
  | 'home'
  | 'chart'
  | 'staff'
  | 'students'
  | 'guardians'
  | 'classes'
  | 'attendance'
  | 'lessonPlans'
  | 'clock'
  | 'incidents'
  | 'inbox'
  | 'hr'
  | 'finance'
  | 'admin'

export type AppRoute = {
  href: `/${string}`
  label: string
  icon: IconName
  /** Omit = any signed-in staff. */
  permission?: (role: StaffRole) => boolean
  /** Show in sidebar. Detail/edit routes are covered by prefix, not listed. */
  nav: boolean
}

export const routes: readonly AppRoute[] // in sidebar order
export const publicPaths: readonly string[] // ['/register']
/** Longest-prefix match: '/finance/students/x' → the '/finance' route. */
export function routeForPath(pathname: string): AppRoute | undefined
export function canAccessPath(pathname: string, role: StaffRole): boolean
```

```tsx
// src/app/_components/PageHeader.tsx
<PageHeader title subtitle?: string backHref?: string backLabel?: string action?: ReactNode />
// backHref renders "← {backLabel}" above the title (the pattern already in classes/[id]/page.tsx).
```

```ts
// src/env.ts
import { z } from 'zod'
const server = z.object({
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.string().url().optional(),
  AZURE_AD_CLIENT_ID: z.string().min(1),
  AZURE_AD_TENANT_ID: z.string().min(1),
  AZURE_AD_CLIENT_SECRET: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(), // removed in plan 10
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1), // removed in plan 10
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().startsWith('mailto:'),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  TURNSTILE_EXPECTED_HOSTNAME: z.string().optional(),
  E2E_TEST: z.enum(['true']).optional(),
  E2E_TEST_SECRET: z.string().optional(),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
})
const client = z.object({
  NEXT_PUBLIC_GA_ID: z.string().optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
})
export const env = {
  server: server.parse(process.env),
  client: client.parse({
    /* explicit NEXT_PUBLIC_* reads so Next inlines them */
  }),
}
```

`env.server` is only importable from server files: add `import 'server-only'` in a sibling
`src/env.server.ts` that re-exports `env.server`, and have `src/env.ts` export only `client`.
`src/security.spec.ts` already forbids secret names in client components; add: client components
must not import `@/env.server`.

## Implementation steps

### Routes (A2)

1. Create `src/lib/routes.ts` from the `navItems` array in `src/app/layout.tsx` (same order,
   labels and `filter` functions → `permission`). Add `nav: false` entries only where a permission
   applies to a non-nav prefix (none today — `/students/new` etc. are covered by `/students`'s
   prefix, and their finer permission stays on the page).
2. `src/proxy.ts`: replace the hand-written `isReportsPage`/`isFinancePage`/`isHrPage` blocks with
   `publicPaths` + `canAccessPath(pathname, role)`. Keep the login/dashboard redirects. Update
   `src/proxy.spec.ts` to iterate `routes` and assert each permissioned route redirects the wrong
   roles.
3. `src/app/layout.tsx`: `AuthedSidebar` filters `routes` by `nav && permission?.(role) ?? true`
   and passes `{ href, label, icon }`. Delete the local `navItems`. `SidebarLoadingSkeleton` also
   renders from `routes`.
4. `src/app/_components/PortalSidebar.tsx`: replace the private href→icon map with
   `const ICONS: Record<IconName, ComponentType>` and render `ICONS[item.icon]`.
5. `src/auth/require.ts`: add `requireRouteAccess(pathname)` = `requireRole(r => canAccessPath(pathname, r))`
   for pages that want the route's own permission (finance, hr, reports, admin, registrations,
   guardians). Replace their explicit `requireRole(canManageFinance)` with it where the check is
   identical; keep explicit checks where the page needs a finer rule.

### Page shell (A3, G3)

6. Extend `PageHeader` as specified. Replace every inline `<h1 className="text-2xl font-bold …">`
   page title under `src/app` with `PageHeader` (dashboard's "Welcome back" heading included —
   `subtitle={roleLabels[role]}`). Delete the private `PageHeader` function in
   `src/app/reports/page.tsx`. The new/edit page pattern
   (`<div className="max-w-2xl"><div className="mb-6"><h1>…</h1><p>…</p></div>`) becomes
   `<PageHeader title subtitle backHref />` inside the same `max-w-2xl` wrapper.
7. Create `src/app/not-found.tsx` (title "Not found", one-line explanation, link to `/dashboard`)
   and `src/app/error.tsx` (`'use client'`, `reset` button, link to `/dashboard`). Style them with
   the same card classes as `EmptyState`.
8. Replace every "record missing → `redirect(list)`" with `notFound()`. Find with
   `rg -n "if \(!\w+\) redirect\(" src/app`. Known sites: `classes/[id]/page.tsx`,
   `classes/[id]/edit/page.tsx`, `students/[id]/edit/page.tsx`, `staff/[id]/edit/page.tsx`,
   `guardians/[id]/page.tsx`, `guardians/[id]/edit/page.tsx`, `incidents/[id]/edit/page.tsx`,
   `lesson-plans/[id]/edit/page.tsx`, `registrations/[id]/page.tsx`, `finance/students/[id]/page.tsx`,
   `finance/fee-plans/[id]/edit/page.tsx`, `hr/staff/[id]/page.tsx`. Teacher-scoping redirects
   (e.g. a teacher opening another teacher's class) also become `notFound()` — don't reveal
   existence.
9. Add `loading.tsx` to every segment that lacks one: `finance`, `finance/fee-plans/new`,
   `finance/fee-plans/[id]/edit`, `finance/students/[id]`, `hr`, `hr/staff/[id]`, `guardians`,
   `guardians/[id]`, `guardians/[id]/edit`, every `*/new` and `*/[id]/edit`. Use `TableSkeleton`
   for lists and a new `FormSkeleton` (`src/components/FormSkeleton.tsx`, grey blocks matching
   `FormSection`) for forms. The skeleton must render `PageHeader` with the real title so the
   header paints immediately.
10. Streaming: wrap the stat cards in `dashboard/page.tsx` in `<Suspense fallback={<StatCardsSkeleton/>}>`
    by moving the data fetch into a child server component `DashboardStats`; same for
    `EnrolmentHistoryTable` on `classes/[id]/page.tsx` and `PeriodReport` on `reports/page.tsx`.
    The header, year selector and tab bar must render without awaiting data.

### Environment (A4)

11. Create `src/env.ts` / `src/env.server.ts`. Replace every `process.env.X` in `src` (non-spec)
    with `env.server.X` / `env.client.X`. Delete `env.d.ts`. `vitest.setup.ts` sets the variables
    the schema requires (dummy values) so unit tests don't fail at import.
12. `.env.local.example` and `.env.e2e.example`: ensure every variable in the schema is listed with
    its comment; `README.md` env section points at `src/env.ts` as the source of truth.

## Files

**Create:** `src/lib/routes.ts` + spec, `src/env.ts`, `src/env.server.ts` + spec,
`src/app/not-found.tsx`, `src/app/error.tsx`, `src/components/FormSkeleton.tsx`, ~14 `loading.tsx`,
`src/app/dashboard/DashboardStats.tsx`.
**Modify:** `src/proxy.ts` + spec, `src/app/layout.tsx`, `src/app/_components/PortalSidebar.tsx`,
`src/app/_components/PageHeader.tsx`, `src/auth/require.ts`, every `page.tsx` with an inline `<h1>`
or a missing-record redirect, every file reading `process.env`, `vitest.setup.ts`, `security.spec.ts`,
`.env.*.example`, `README.md`.
**Delete:** `env.d.ts`.

## Acceptance criteria

- `rg "process\.env\." src --glob '!*.spec.*'` returns only `src/env.ts` and `src/env.server.ts`.
- `rg "<h1" src/app --glob '!*.spec.*'` returns only `PageHeader.tsx`, `not-found.tsx`, `error.tsx`,
  `login/page.tsx`, `register/**` and print-only headings.
- `rg "redirect\('/(students|staff|classes|guardians|incidents|lesson-plans|registrations|finance|hr)'\)" src/app/**/\[id\]/**` returns nothing.
- Every directory under `src/app` containing a `page.tsx` (except `login`, `register/**`, `api`)
  has a `loading.tsx`.
- `proxy.spec.ts` proves every permissioned route in `routes` redirects a teacher to `/dashboard`.
- Opening `/students/00000000-0000-0000-0000-000000000000/edit` as admin shows the not-found page
  (add E2E).
- `npm run pipeline:check` green.

## Deliberate UX changes

- Missing/forbidden records show a "Not found" page instead of silently redirecting to the list.
- Every page header has the same layout; new/edit pages gain a "← Back to X" link.
- New/edit routes show a skeleton while loading instead of a blank area.
