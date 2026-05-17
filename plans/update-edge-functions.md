# Audit: Next.js / Netlify Latency for EU Users

## Context

Users and Supabase DB are in the EU. All Next.js server code currently defaults to Node.js (Lambda),
which Netlify places in **us-east-1** on the free tier. Every authenticated request from an EU user
travels: EU → US Lambda → EU Supabase → US Lambda → EU user. Moving eligible routes to Netlify's
Edge Functions (which run at the nearest PoP — including EU ones) would cut that to:
EU → EU Edge PoP → EU Supabase → back.

---

## 1. Runtime Inventory

**No explicit `export const runtime` declarations exist anywhere in the codebase.**
Everything runs on Node.js Lambda by default.

### Route Handlers

| File                                      | Runtime        | Can move to Edge?                                    |
| ----------------------------------------- | -------------- | ---------------------------------------------------- |
| `src/app/api/auth/[...nextauth]/route.ts` | Node (default) | **YES** — NextAuth v5 is Edge-compatible             |
| `src/app/api/push/subscribe/route.ts`     | Node (default) | **NO** — likely uses Node-only crypto via `web-push` |

### Server Actions (13 files)

All of these **always run on Node.js** — the Next.js spec prohibits Server Actions on the Edge runtime.
They cannot be moved. Files:

- `src/app/actions.ts` — cache invalidation
- `src/app/attendance/actions.ts` — save attendance + push notifications
- `src/app/classes/new/actions.ts`, `src/app/classes/[id]/edit/actions.ts`
- `src/app/incidents/actions.ts`, `src/app/lesson-plans/actions.ts`
- `src/app/staff/new/actions.ts`, `src/app/staff/[id]/edit/actions.ts`
- `src/app/staff-attendance/actions.ts`
- `src/app/students/new/actions.ts`, `src/app/students/[id]/edit/actions.ts`
- `src/app/guardians/[id]/edit/actions.ts`
- `src/app/admin/_tabs/class-migration/actions.ts`

### Server Components (read-only pages)

All pages are Server Components that `await auth()` and call `src/db/*` functions. These are
**candidates** for Edge, with one caveat (see §3).

### Middleware

**None exists.** No `middleware.ts` at the project root.

---

## 2. Supabase Connection

| Aspect                  | Detail                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **Driver**              | `@supabase/supabase-js` v2 (HTTP/REST-based) — **Edge-compatible**                             |
| **Native PG driver?**   | No `pg`, `postgres`, `prisma`, or `drizzle`                                                    |
| **Client location**     | `src/db/client.ts` — singleton export                                                          |
| **Auth method**         | `SUPABASE_SERVICE_ROLE_KEY` (service role, server-only)                                        |
| **`server-only` guard** | Yes — `import 'server-only'` at top of `client.ts`                                             |
| **Connection pooling**  | Not configured — but irrelevant since `@supabase/supabase-js` uses HTTP, not native PG sockets |
| **`@supabase/ssr`**     | Not used — auth is handled entirely by NextAuth, not Supabase Auth                             |

**The good news**: Because the Supabase client uses HTTP (fetch), it works on the Edge runtime without
any changes. The `server-only` directive is a compile-time check and does not block Edge.

**Caching pattern**: `src/db/staff.ts` (and other db files) wrap queries in `unstable_cache` with
`revalidateTag`. Behaviour of `unstable_cache` in Netlify's Edge environment needs verification
before converting pages that rely on it (see §3 risk).

---

## 3. Edge Candidacy Assessment

### Can move — low risk

- **`src/app/api/auth/[...nextauth]/route.ts`**: NextAuth v5 (`next-auth@5.0.0-beta.30`) was
  designed for Edge. Adding `export const runtime = 'edge'` here benefits every session
  validation and OAuth callback. High traffic, high impact.

### Can move — verify `unstable_cache` first

- **All read-only pages** (`dashboard`, `classes`, `students`, `staff`, `incidents`, etc.):
  These call `src/db/*` functions that use `unstable_cache`. Netlify's Edge Functions run on
  Deno Deploy infrastructure; the Next.js Data Cache (`unstable_cache`) should work but
  **must be tested on a branch deploy before shipping to production**.

### Cannot move

| Route                                      | Reason                                           |
| ------------------------------------------ | ------------------------------------------------ |
| Any page that imports a Server Action file | Actions pin the page to Node                     |
| `src/app/login/page.tsx`                   | Has inline `'use server'` functions              |
| `src/app/layout.tsx`                       | Has inline sign-out Server Action                |
| `src/app/api/push/subscribe/route.ts`      | `web-push` library uses Node.js `crypto` module  |
| All 13 `actions.ts` files                  | Next.js spec: Server Actions = Node only, always |

---

## 4. Netlify / Next.js Config

### `netlify.toml`

```toml
[build]
  command = "npm test && npm run build"
[[plugins]]
package = "@netlify/plugin-nextjs"
```

- No `[functions]` block → no region override → defaults to **us-east-1**
- No `[edge_functions]` block
- Free tier: **cannot configure Lambda region** (paid plans can set `AWS_LAMBDA_JS_RUNTIME` or
  use a `[functions] node_bundler` block with region)

### `next.config.js`

```js
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  reactCompiler: true,
}
```

No edge or region configuration.

### Supabase project region

Confirm in Supabase Dashboard → Project Settings → General. If it's not `eu-west-*` or
`eu-central-*`, that's a separate problem (move the DB, or use the Supabase connection pooler
pointed at an EU replica).

---

## 5. Recommendations (ranked by impact ÷ effort)

### 🥇 1. Add `export const runtime = 'edge'` to the NextAuth route handler

**Impact: High | Effort: 1 line | Risk: Low**

File: `src/app/api/auth/[...nextauth]/route.ts`

NextAuth v5 supports Edge. This makes every login redirect, OAuth callback, and session cookie
operation run at the nearest Netlify PoP. EU users get it served from EU instead of us-east-1.

```ts
export const runtime = 'edge'
export { GET, POST } from '@/auth'
```

Verify: deploy to preview branch, test Microsoft login end-to-end.

---

### 🥈 2. Add Edge middleware for auth session checking

**Impact: High | Effort: Medium | Risk: Low**

Currently there is **no `middleware.ts`**. Every protected page loads a full Lambda cold start
just to run `await auth()` and redirect unauthenticated users.

A lean Edge middleware at the root can reject unauthenticated requests before they ever reach
the Lambda — this runs at the CDN edge, nearest to the user.

File to create: `middleware.ts`

```ts
// Match every route except api/_next/static/auth-handled paths
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login).*)'],
}
// Use NextAuth's built-in middleware helper
export { auth as middleware } from '@/auth'
```

NextAuth v5 exports a compatible middleware. The session JWT is verified at the edge (no DB
call needed). The Lambda only runs for authenticated users.

---

### 🥉 3. Convert read-only pages to Edge (after verifying `unstable_cache`)

**Impact: Medium | Effort: Medium | Risk: Medium (test first)**

Pages like `dashboard`, `classes`, `students`, `incidents`, `lesson-plans`, `timetables`,
`reports`, `staff` are pure reads — no Server Actions in the page file itself (actions live
in sibling `actions.ts` files).

Add to each page file:

```ts
export const runtime = 'edge'
```

**Pre-condition**: deploy one page (e.g. `src/app/classes/page.tsx`) to a Netlify preview
branch and confirm `unstable_cache` / `revalidateTag` works correctly. If the cache is busted
correctly after a mutation, roll out to remaining pages.

Pages that **cannot** get this treatment: `src/app/login/page.tsx` (inline `'use server'`),
any page whose layout has inline Server Actions (check `src/app/layout.tsx`).

---

### 4. Upgrade Netlify plan to configure Lambda region

**Impact: High (for Server Actions) | Effort: Zero code | Cost: $$$**

Server Actions, the push route, and any Node-pinned routes will always be Lambdas. On a paid
Netlify plan you can set the function region to match your Supabase EU region. This is the
only way to reduce latency for mutation paths (Server Actions).

In `netlify.toml` on paid plans:

```toml
[functions]
  node_bundler = "esbuild"
  # region can be configured in Netlify UI → Site settings → Functions
```

---

### 5. Confirm Supabase DB region

**Impact: Potentially very high | Effort: Zero code**

Check Supabase Dashboard → Project Settings → General. If the DB is not in an EU region
(`eu-west-1`, `eu-west-2`, `eu-central-1`), all of the above is moot — the DB itself is in the
wrong hemisphere. This should be the first thing verified.

---

## Critical Path Summary

```
1. Confirm Supabase DB is in an EU region             ← verify first, no code
2. Add `runtime = 'edge'` to NextAuth route handler   ← 1 line, ship fast
3. Add Edge middleware for unauthenticated redirects  ← medium effort, big UX win
4. Test one page on Edge in preview branch            ← de-risk the `unstable_cache` question
5. Roll out Edge to all read-only pages               ← after step 4 passes
6. Consider Netlify paid plan for Lambda region       ← needed for Server Actions
```

## Files to Modify

- `src/app/api/auth/[...nextauth]/route.ts` — add `export const runtime = 'edge'`
- `middleware.ts` (create new) — NextAuth Edge middleware
- `src/app/dashboard/page.tsx` and other read-only pages — add `export const runtime = 'edge'`
- `src/app/classes/page.tsx`, `src/app/students/page.tsx`, `src/app/staff/page.tsx`,
  `src/app/incidents/page.tsx`, `src/app/lesson-plans/page.tsx`, `src/app/timetables/page.tsx`,
  `src/app/reports/page.tsx`, `src/app/attendance/page.tsx`

## Verification

- Deploy to Netlify preview branch after each change
- Use browser DevTools → Network to measure TTFB before/after
- Test Microsoft OAuth login end-to-end after touching the auth route
- Check that `revalidateTag` still busts cache after a Server Action mutation (e.g. save attendance,
  then verify the attendance page reflects the change without a manual deploy)
