# HSHB Staff Portal

Internal staff portal for the Hellenic School of High Barnet, deployed at [portal.hshb.org.uk](https://portal.hshb.org.uk). Handles students, staff, classes, attendance, lesson plans, incidents, reports, and audit logging across four roles (admin, headteacher, teacher, secretary).

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack, React Compiler)
- [React 19](https://react.dev)
- Postgres hosted on [Supabase](https://supabase.com), accessed with [Drizzle ORM](https://orm.drizzle.team) over a direct [postgres.js](https://github.com/porsager/postgres) connection. `@supabase/supabase-js` remains only for the `.rpc()` calls to the database functions that refactor plan 10 moves to TypeScript — see [Database](#database)
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

Copy `.env.local.example` to `.env.local` and fill in the values. The example file lists every variable with a comment explaining where to get it. `src/env.ts` (client) and `src/env.server.ts` (server, `import 'server-only'`) are the source of truth: every variable is parsed through a Zod schema at module load, so a missing or malformed value fails fast instead of surfacing as an unexplained `undefined` at runtime. The non-obvious ones:

- **`AUTH_SECRET`** — generate with `openssl rand -base64 32`
- **`AZURE_AD_*`** — Microsoft Entra ID app registration (Azure portal → App registrations → HSHB Portal)
- **`DATABASE_URL`** — direct Postgres connection used by Drizzle. Locally `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; in production the Supabase **transaction pooler** URL (Supabase dashboard → Connect → Transaction pooler, port 6543). Server-only
- **`SUPABASE_SERVICE_ROLE_KEY`** — Supabase dashboard → Project Settings → API. Server-only; never expose to the browser
- **`VAPID_*` keys** — generate with `npx web-push generate-vapid-keys`
- **`NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`** — Cloudflare Turnstile, gates the public `/register` form. Cloudflare dashboard → Turnstile → add a site. Local dev/E2E/CI use Cloudflare's published always-pass test keys (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`); production needs real keys for the `portal.hshb.org.uk` hostname. Set `TURNSTILE_EXPECTED_HOSTNAME=portal.hshb.org.uk` in production only, to reject tokens verified against another origin — leave it unset locally/CI since the test keys don't return a real hostname

### Run the database

```bash
npm run supabase:start
```

This starts the local Supabase stack via Docker: Postgres on `127.0.0.1:54322` (what `DATABASE_URL` points at) and the Supabase API on `http://127.0.0.1:54321`. First run downloads the Supabase images (~1.5 GB) and applies migrations + seed data.

Other helpers:

- `npm run supabase:reset` — drop the local DB, re-apply every migration and re-seed
- `npm run supabase:stop` — stop the Docker stack

## Database

`src/db/schema.ts` (Drizzle) is the source of truth for tables, columns, enums, foreign keys, indexes, `CHECK` constraints, defaults and relations. Application code reads and writes through the Drizzle client `db` exported from `src/db/client.ts`, a postgres.js connection to `DATABASE_URL`. Supabase is only the Postgres host and the CLI that applies migrations — no Supabase Auth, RLS policies, Storage or Realtime.

### Changing the schema

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` — drizzle-kit diffs the schema against the last snapshot in `supabase/migrations/meta/` and writes `supabase/migrations/<timestamp>_<name>.sql` (pass `-- --name=<name>` for a readable name).
3. Review the generated SQL. It must contain only the change you intended.
4. `npm run supabase:reset` — applies it locally with the Supabase CLI and re-seeds.
5. Commit `schema.ts`, the new `.sql` file and the updated `meta/` files together.

`npm run db:check` validates the migration history. Rules:

- Never hand-write DDL for something `schema.ts` can express, and never edit a migration that has been applied to production — add a new one.
- Never run `drizzle-kit push` or `drizzle-kit migrate`; migrations are applied only by the Supabase CLI (`supabase db reset` locally, `supabase db push` for production).
- Never edit files in `supabase/migrations/meta/`; drizzle-kit owns them.
- For the few things Drizzle cannot model (the `academic_years_no_overlap` `EXCLUDE` constraint, triggers, and the PL/pgSQL functions still awaiting plan 10), create an empty migration with `npx drizzle-kit generate --custom --name=<name>` and write the SQL there.
- Do not add new PL/pgSQL functions or triggers. Multi-statement writes are TypeScript functions in `src/db/*.ts` using `db.transaction(async (tx) => …)`.
- Until plan 10 lands, also run `npm run gen:types` (refreshes `src/types/database.ts`) and `npx supabase db dump --local --schema public -f supabase/schema.sql` after a schema change. Both files are legacy snapshots for the remaining supabase-js code; plan 10 deletes them.

### Writing queries

- Use `db` from `@/db/client` and the tables and row types (`Student`, `NewStudent`, …) from `@/db/schema`. Never use `supabase.from(…)`. `supabase.rpc(…)` is kept only for the existing database functions until plan 10.
- Use the relational API (`db.query.students.findFirst({ with: … })`) for an entity plus its children, and the SQL-like builder with `count()`, `sum()` and `groupBy` for aggregates — not fetch-then-group in a JS `Map`.
- Drizzle rows are camelCase; the functions in `src/db` return and accept the snake_case shapes the app uses. Convert at that boundary with `toSnake` / `toCamel` from `src/db/casing.ts`. `timestamptz` columns come back as ISO strings (`2026-09-27T12:00:00+00:00`).
- One exported function = one query or one transaction. Every module in `src/db` starts with `import 'server-only'`.
- Production uses the Supabase Supavisor **transaction pooler** (port 6543), which is why the client sets `prepare: false`.

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

### Database integration tests (Vitest)

```bash
npm run test:int
```

`src/db/*.int.spec.ts` run against the local Supabase Postgres (`npm run supabase:start` first), configured by `vitest.int.config.ts`. `SUPABASE_SERVICE_ROLE_KEY` is read from `.env.e2e`. They are excluded from `npm test` and from coverage.

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
  app/register/    # Public parent registration form (no auth) — see plans/parent-registration-form.md
  app/registrations/ # Admin inbox — review registration submissions and photo opt-outs
  auth/            # NextAuth v5 config + helpers
  clientComponents/# Shared client components (have 'use client')
  components/      # Shared server components
  db/              # Data access — one file per domain; schema.ts (Drizzle schema), client.ts (db)
  lib/             # Permissions, schemas, utilities
  types/           # database.ts (legacy, auto-generated via npm run gen:types until plan 10), other shared types
e2e/
  auth.setup.ts    # Produces storageState per role
  global-setup.ts  # `supabase db reset` before the suite
  fixtures/        # Custom Playwright fixtures
  tests/           # E2E specs (*.e2e.ts)
supabase/
  schema.sql       # Legacy schema dump, kept until plan 10 — src/db/schema.ts is the source of truth
  migrations/      # Generated by `npm run db:generate`; applied by the Supabase CLI to local + production
  migrations/meta/ # drizzle-kit snapshots and journal — never edit by hand
drizzle.config.ts  # drizzle-kit config (schema path, migrations folder, casing)
  seed.sql         # Deterministic test data
scripts/
  sw.template.js   # PWA service worker source
  build-sw.mjs     # Writes public/sw.js (run by `npm run dev` and `npm run build`)
public/
  sw.js            # Generated, git-ignored — edit scripts/sw.template.js
```

## Registrations review

`/registrations` is the inbox for the two public parent forms. Its tabs are the registration statuses (To-do, Actioned, Rejected, All) plus **Photo opt-outs**, which lists `/register/photo-opt-out` requests filtered by `?status=` (pending by default). Both kinds of submission follow the same shape: list → review page (`/registrations/[id]`, `/registrations/photo-opt-outs/[id]`) → action dialog.

The dialogs are shared, from `src/components/dialogs`: `ReasonDialog` rejects either kind, `ConfirmDialog` deletes either kind, and `MatchStudentDialog` applies an opt-out to an existing student. Registration approval uses `RegistrationApproveDialog`, which adds class and guardian choices to the same student picker (`StudentMatchList`). All six server actions live in `src/app/registrations/actions.ts`. Any reviewer can open the pages; only admins can act.

## Authentication

Production uses **Microsoft Entra ID** OAuth via NextAuth v5. Staff sign in with their school Microsoft account; `signIn` callback verifies the account exists in the `staff` table.

Roles are stored on the `staff` row (`admin | headteacher | teacher | secretary`) and surfaced via the session JWT. Permission helpers in [src/lib/permissions.ts](src/lib/permissions.ts) gate every action.

For E2E only, a test-only `Credentials` provider activates when `E2E_TEST=true` and `NODE_ENV !== 'production'`. It is impossible to enable in production builds.

## Deployment

Production deploys from `main` to Netlify automatically. The build runs `npm test && npm run build` (E2E is gated to CI only — Netlify's build sandbox has no Docker).

The push notifications subscription endpoint (`/api/push/subscribe`) and all server actions require Node.js runtime (web-push uses Node crypto). See [plans/update-edge-functions.md](plans/update-edge-functions.md) for the Edge candidacy audit.

## Plans / roadmap

Active plans live in [plans/](plans/):

- [refactor/](plans/refactor/README.md) — phased code-quality programme (action wrapper, form kit, Drizzle, cache removal); one brief per coding agent
- [bulk-email-functionality.md](plans/bulk-email-functionality.md) — Resend-backed bulk email to staff, classes, all-students
- [integration-tests.md](plans/integration-tests.md) — Playwright E2E coverage matrix (Phase 1 shipped; rest is a pending backlog)
- [offline-read-only-mode.md](plans/offline-read-only-mode.md) — PWA offline UX + service worker work
- [update-edge-functions.md](plans/update-edge-functions.md) — Netlify Edge runtime audit for EU latency
- [parent-registration-form.md](plans/parent-registration-form.md) — public `/register` form, staging tables, admin approval workflow
- [parent-consent-link.md](plans/parent-consent-link.md) — planned follow-up: consent-refresh links for returning families

Actioned submissions and opt-out requests are kept until an admin deletes them from the review page. There is no automatic purge.

## Related repository

The public marketing site at [hshb.org.uk](https://www.hshb.org.uk) lives in a separate repo, [iAppGeek/hshb](https://github.com/iAppGeek/hshb). The two repos share no runtime dependencies.
