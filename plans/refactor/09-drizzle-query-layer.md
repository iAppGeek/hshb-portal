# 09 — Drizzle query layer (reads and simple writes)

| Delivers            | Cx  | Reuse | Arch | Size | Depends on |
| ------------------- | :-: | :---: | :--: | :--: | ---------- |
| D0 (part 1), D2, D4 |  7  |   6   |  9   |  L   | 03         |

## Goal

Introduce Drizzle ORM as the single database access layer, with the schema defined in TypeScript,
and port every **read** and every **single-statement write** in `src/db/*.ts` to it. RPC calls to
PL/pgSQL functions remain on `supabase-js` until plan 10 — this plan runs both clients side by side
and is shippable on its own.

Along the way, the aggregation pattern "fetch N rows then group them in a JS `Map`" (dashboard,
`getStudentsByTeacher`, guardians list, class enrolment counts, fee summaries) becomes one typed
query with joins / `count()` / `sum()`. `fetchAllPages` goes away because there is no 1,000-row
PostgREST cap on a direct connection.

## Decisions already made

- **Packages** (exact versions at the time of implementation; pin them):
  `drizzle-orm`, `postgres` (postgres.js) as runtime deps; `drizzle-kit` as a dev dep.
  Nothing else. Not `pg`, not `@neondatabase/serverless`, not `drizzle-zod` (Zod schemas stay
  hand-written in `src/lib/schemas.ts`; input schemas and DB schema serve different shapes).
- **Connection:** `DATABASE_URL`. Local = `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
  (Supabase CLI default). Production = the Supabase **Supavisor transaction pooler** URL (port 6543) — required because Netlify functions are short-lived. postgres.js options:
  `{ prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 }` (`prepare: false` is mandatory
  with transaction pooling). Module-level singleton in `src/db/client.ts`, guarded against HMR
  re-creation with `globalThis`.
- **Schema file:** `src/db/schema.ts` — one file, `pgTable` per table, `pgEnum` for the three
  enums, `relations()` for every FK so the relational query API (`db.query.students.findMany({ with:
… })`) is available. Column names stay snake_case in the DB; TS property names are camelCase via
  `casing: 'snake_case'` in both `drizzle.config.ts` and the `drizzle()` client. Row types are
  `typeof students.$inferSelect` etc., exported from `schema.ts` as `Student`, `NewStudent`, ….
- **Migrations:** `drizzle-kit generate` with `out: './supabase/migrations'`, `migrations: { prefix:
'supabase' }`, `schemaFilter: ['public']`. Applied by the Supabase CLI as today (`supabase db
reset` locally, `supabase db push` in production). `drizzle-kit migrate` / `push` are **not** used.
  The `meta/` folder that drizzle-kit writes is committed.
- **Bootstrap:** the first generated migration must be **empty**. Write `schema.ts` by hand from
  `supabase/schema.sql` (or run `drizzle-kit pull` against the local DB into a scratch folder and
  tidy the output into `schema.ts`), then run `drizzle-kit generate` and confirm the produced SQL
  contains no statements other than comments. Iterate on `schema.ts` until it does. This proves the
  TS schema matches production. Then run `drizzle-kit generate --custom --name=drizzle_baseline` to
  create the journal entry without SQL.
- **Type source:** `src/types/database.ts` (Supabase generated) is kept until plan 10 because RPC
  wrappers still use it. New code imports row types from `@/db/schema`.
- **Module layout unchanged:** `src/db/students.ts` etc. keep their file names and exported
  function names so `src/app` does not change in this plan (exceptions listed below). `src/db/index.ts`
  barrel stays.
- **Errors:** `src/lib/db-error.ts` maps postgres.js errors (`err.code` `'23505'`, `'23503'`,
  `'23514'`, `'22P02'`, `err.constraint_name`) instead of PostgREST shapes. Same user-facing strings
  where the existing spec asserts them.
- **Testing:** `src/db/*.spec.ts` currently mock the Supabase builder chain. Replace them with
  **integration specs** `src/db/*.int.spec.ts` that run against the local Supabase Postgres
  (`supabase start` is already required for E2E). Add a `vitest.int.config.ts` with
  `include: ['src/**/*.int.spec.ts']`, `globalSetup` that truncates tables and loads
  `supabase/seed.sql`, and an npm script `test:int`. Run it in `.github/workflows/e2e.yml` after
  `supabase start`. Unit coverage thresholds are computed by the existing `vitest.config.ts`, which
  must `exclude` `src/db/**` from coverage (it did not meaningfully cover it before — the mocks
  tested the mocks). Delete the old `src/db/*.spec.ts` for ported modules.

## API

```ts
// src/db/client.ts
import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { env } from '@/env.server'

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>
}
const sql =
  globalForDb.sql ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  })
if (env.NODE_ENV !== 'production') globalForDb.sql = sql

export const db = drizzle(sql, { schema, casing: 'snake_case' })
export type Db = typeof db
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Kept until plan 10 for .rpc() calls only. */
export { supabase } from './supabase-client' // move the existing supabase-js client here
```

```ts
// drizzle.config.ts (repo root)
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './supabase/migrations',
  casing: 'snake_case',
  schemaFilter: ['public'],
  migrations: { prefix: 'supabase' },
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  },
  strict: true,
  verbose: true,
})
```

Query style rules (apply throughout):

- Prefer the relational API for "entity + its children" reads
  (`db.query.students.findFirst({ where: eq(students.id, id), with: { guardians: { with: { guardian: true } } } })`).
- Use the SQL-like builder with `count()`, `sum()`, `max()` and `groupBy` for aggregates. No
  `Map`-based grouping in TypeScript when the database can do it in one statement.
- One exported function = one query (or one transaction). No function calls another exported DB
  function to assemble a result; compose in SQL instead.
- Keep `membership.ts` helpers, but they now return Drizzle `SQL` fragments
  (`currentStay(studentClasses, onDate)`), used with `and(...)`.
- Every DB module starts with `import 'server-only'`.

## Implementation steps

1. **Setup.** Add deps, `drizzle.config.ts`, `DATABASE_URL` to `src/env.server.ts` (plan 06; if
   06 has not landed yet, read `process.env.DATABASE_URL` in `client.ts` with a `// TODO(plan-06)`
   and nothing else) and to
   `.env.local.example`, `.env.e2e.example`, `.github/workflows/e2e.yml`, `netlify.toml`
   documentation. Add scripts: `"db:generate": "drizzle-kit generate"`, `"db:check": "drizzle-kit check"`,
   `"test:int": "vitest run -c vitest.int.config.ts"`.
2. **Schema.** Write `src/db/schema.ts` for all 21 tables (20 after plan 01), 3 enums, all FKs,
   unique indexes, `CHECK` constraints and defaults, plus `relations()`. Include the
   `set_updated_at` trigger behaviour **as a schema-level default only** (`updatedAt:
timestamp().defaultNow()`); the triggers themselves remain in the DB until plan 10 and are not
   modelled in Drizzle. Achieve the empty-diff bootstrap described above; commit the `meta/`
   journal.
3. **Client.** Replace `src/db/client.ts`; move the supabase-js client to `src/db/supabase-client.ts`.
4. **Port modules** in this order, each as its own commit, running `test:int` and the relevant E2E
   suite after each:
   1. `academic-years.ts` (small; `setCurrentAcademicYear` keeps `.rpc` until plan 10)
   2. `staff.ts`, `staff-attendance.ts`, `staff-payroll.ts`
   3. `classes.ts` — `getClassesWithCounts` becomes one query with `count()` over current stays
      grouped by class; `getEnrolmentHistory` drops `fetchAllPages`; `migrateClass` / `setEnrolments`
      keep `.rpc` for now.
   4. `students.ts` — `getStudentsByTeacher` becomes one query (students ⋈ student_classes ⋈
      classes where `teacher_id = ?` and current stay); `findStudentMatches`, `setEnrolments`,
      `markStudentAsLeaver` keep `.rpc`.
   5. `guardians.ts` — list with counts via `count()`; `findGuardianMatches` keeps `.rpc`.
   6. `attendance.ts`, `incidents.ts`, `lesson-plans.ts`, `push-subscriptions.ts`, `audit-log.ts`
   7. `fee-plans.ts`, `student-fees.ts` — fee summary via `sum()`; `saveFeePlan` keeps `.rpc`.
   8. `registrations.ts`, `photoOptOuts.ts` — reads and status updates; `createRegistrationSubmission`,
      `approveRegistration`, `applyPhotoOptOut` keep `.rpc`.
   9. Dashboard: add `src/db/dashboard.ts` exporting `getDashboardStats(actor)` that returns every
      figure `dashboard/page.tsx` needs in **one** round-trip using a single `select` with
      sub-selects (`sql<number>\`(select count(*) from …)\``per stat is acceptable and readable).`dashboard/page.tsx`(and`DashboardStats` from plan 06) call only this function.
5. **Delete** `src/db/paging.ts` and its spec once no module imports `fetchAllPages`.
6. **Errors.** Rewrite `src/lib/db-error.ts` for postgres.js error shapes; keep the spec's expected
   messages.
7. **E2E fixtures.** `e2e/fixtures/seed.ts` uses supabase-js directly; leave it for plan 10.
8. **Docs.** `README.md`: stack list, "Database" section explaining schema-as-code and the migration
   workflow (`edit schema.ts → npm run db:generate → review SQL → supabase db reset → commit`).

## Files

**Create:** `drizzle.config.ts`, `src/db/schema.ts`, `src/db/supabase-client.ts`, `src/db/dashboard.ts`,
`src/db/*.int.spec.ts`, `vitest.int.config.ts`, `supabase/migrations/meta/*`,
`supabase/migrations/<ts>_drizzle_baseline.sql` (empty).
**Modify:** `src/db/client.ts`, every `src/db/*.ts`, `src/db/membership.ts`, `src/lib/db-error.ts`,
`src/env.server.ts`, `vitest.config.ts`, `package.json`, `.env*.example`, `.github/workflows/e2e.yml`,
`README.md`, `src/app/dashboard/page.tsx`.
**Delete:** `src/db/paging.ts`, ported `src/db/*.spec.ts`.

## Acceptance criteria

- `npm run db:check` and `npm run db:generate` produce no new migration (schema matches DB).
- `rg "from\('" src/db --glob '!*.spec.*'` returns nothing (no PostgREST table access remains);
  `rg "\.rpc\(" src/db` returns exactly the 11 calls listed above.
- `rg "fetchAllPages|new Map\(" src/db` returns nothing.
- `getDashboardStats` issues one SQL statement (assert via postgres.js `debug` hook in its int
  spec, or by counting `sql` calls with a spy).
- `test:int` runs in CI and passes; unit coverage thresholds unchanged.
- All E2E suites pass unchanged.
- Local-dev TTFB for `/dashboard` (Chrome DevTools, `supabase start` running) is lower than before
  this plan; record before/after in the PR.

## Deliberate UX changes

None.
