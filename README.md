# HSHB Staff Portal

Internal staff portal for the Hellenic School of High Barnet, deployed at [portal.hshb.org.uk](https://portal.hshb.org.uk). Handles students, staff, classes, attendance, lesson plans, incidents, timetables, reports, and audit logging across four roles (admin, headteacher, teacher, secretary).

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack, React Compiler)
- [React 19](https://react.dev)
- [Supabase](https://supabase.com) — Postgres via `@supabase/supabase-js`
- [NextAuth v5](https://authjs.dev) with Microsoft Entra ID (Azure AD)
- [Tailwind CSS 4](https://tailwindcss.com) + [Headless UI](https://headlessui.dev)
- [Zod](https://zod.dev) for input validation
- [web-push](https://github.com/web-push-libs/web-push) for PWA notifications
- [Vitest](https://vitest.dev) for unit/component tests, [Playwright](https://playwright.dev) for E2E
- Deployed on [Netlify](https://www.netlify.com) via `@netlify/plugin-nextjs`

## Getting started

### Prerequisites

- Node.js 24.14+ and npm 11.9+ (enforced via `engines` in `package.json`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running — Supabase local stack uses it

### Install

```bash
npm install
```

### Environment variables

Copy `.env.local.example` to `.env.local` and fill in the values. The example file lists every variable with a comment explaining where to get it. The non-obvious ones:

- **`AUTH_SECRET`** — generate with `openssl rand -base64 32`
- **`AZURE_AD_*`** — Microsoft Entra ID app registration (Azure portal → App registrations → HSHB Portal)
- **`SUPABASE_SERVICE_ROLE_KEY`** — Supabase dashboard → Project Settings → API. Server-only; never expose to the browser
- **`VAPID_*` keys** — generate with `npx web-push generate-vapid-keys`

### Run the database

```bash
npm run supabase:start
```

This starts a local Postgres instance on `http://127.0.0.1:54321` via Docker. First run downloads the Supabase images (~1.5 GB) and applies migrations + seed data.

Other helpers:

- `npm run supabase:reset` — drop and re-seed the local DB
- `npm run supabase:stop` — stop the Docker stack

### Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Testing

### Unit + component tests (Vitest)

```bash
npm test              # one-shot
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

Test files sit alongside source as `*.spec.ts` / `*.spec.tsx`.

### End-to-end tests (Playwright)

E2E tests run against the local Supabase instance using a test-only credentials provider that bypasses Microsoft OAuth. See [plans/integration-tests.md](plans/integration-tests.md) for the full design and remaining test backlog.

```bash
npm run test:e2e       # headless
npm run test:e2e:ui    # Playwright UI
```

Prerequisites: `npm run supabase:start` must be running, and `.env.e2e` must exist locally (copy `.env.e2e.example`).

The suite runs `supabase db reset` before the full run so state is reproducible.

### Full pre-merge gate

```bash
npm run pipeline:check
```

Runs lint → format check → type-check → coverage → E2E → build. Mirrors what CI runs on every PR.

### Auto-fix lint and formatting

```bash
npm run fix:all
```

## Project structure

```
src/
  app/             # Next.js App Router pages, layouts, API routes, server actions
  auth/            # NextAuth v5 config + helpers
  clientComponents/# Shared client components (have 'use client')
  components/      # Shared server components
  db/              # Supabase queries — one file per domain
  lib/             # Permissions, schemas, utilities
  types/           # database.ts (auto-generated), other shared types
e2e/
  auth.setup.ts    # Produces storageState per role
  global-setup.ts  # `supabase db reset` before the suite
  fixtures/        # Custom Playwright fixtures
  tests/           # E2E specs (*.e2e.ts)
supabase/
  schema.sql       # Authoritative schema
  migrations/      # Applied to local + production
  seed.sql         # Deterministic test data
public/
  sw.js            # PWA service worker
```

## Authentication

Production uses **Microsoft Entra ID** OAuth via NextAuth v5. Staff sign in with their school Microsoft account; `signIn` callback verifies the account exists in the `staff` table.

Roles are stored on the `staff` row (`admin | headteacher | teacher | secretary`) and surfaced via the session JWT. Permission helpers in [src/lib/permissions.ts](src/lib/permissions.ts) gate every action.

For E2E only, a test-only `Credentials` provider activates when `E2E_TEST=true` and `NODE_ENV !== 'production'`. It is impossible to enable in production builds.

## Deployment

Production deploys from `main` to Netlify automatically. The build runs `npm test && npm run build` (E2E is gated to CI only — Netlify's build sandbox has no Docker).

The push notifications subscription endpoint (`/api/push/subscribe`) and all server actions require Node.js runtime (web-push uses Node crypto). See [plans/update-edge-functions.md](plans/update-edge-functions.md) for the Edge candidacy audit.

## Plans / roadmap

Active plans live in [plans/](plans/):

- [bulk-email-functionality.md](plans/bulk-email-functionality.md) — Resend-backed bulk email to staff, classes, all-students
- [integration-tests.md](plans/integration-tests.md) — Playwright E2E coverage matrix (Phase 1 shipped; rest is a pending backlog)
- [offline-read-only-mode.md](plans/offline-read-only-mode.md) — PWA offline UX + service worker work
- [update-edge-functions.md](plans/update-edge-functions.md) — Netlify Edge runtime audit for EU latency

## Related repository

The public marketing site at [hshb.org.uk](https://www.hshb.org.uk) lives in a separate repo, [iAppGeek/hshb](https://github.com/iAppGeek/hshb). The two repos share no runtime dependencies.
