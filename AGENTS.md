<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Database: Drizzle over a direct Postgres connection

Full workflow: the "Database" section of `README.md`. The rules:

- **Schema changes:** edit `src/db/schema.ts` → `npm run db:generate` → review the generated SQL in `supabase/migrations/` → `npm run supabase:reset` → commit `schema.ts`, the migration and `supabase/migrations/meta/` together. Do not hand-write DDL that `schema.ts` can express, do not edit `meta/`, and do not edit a migration already applied to production.
- **Never** run `drizzle-kit push` or `drizzle-kit migrate`. Migrations are applied only by the Supabase CLI.
- **Queries:** use `db` from `@/db/client` and tables/row types from `@/db/schema`. Keep aggregation in SQL (`count()`, `sum()`, joins), not in JS `Map`s.
- **No PL/pgSQL functions or triggers.** Multi-statement writes use `db.transaction(async (tx) => …)` in `src/db/*.ts`; a rule the input breaks throws `DbError` from `@/lib/db-error`, whose message the user sees verbatim.
- **RLS stays on, with no policies, on every table.** Every `pgTable` in `schema.ts` ends in `.enableRLS()`, including new ones (`src/db/schema.spec.ts` enforces it). The app connects as `postgres`, which bypasses RLS; RLS and the revoked `anon`/`authenticated` grants shut out Supabase's public Data API. Never disable RLS, add policies, or grant `anon`/`authenticated` anything. Authorisation lives in `requireRole` / `runAction`.
- **Tests:** database code is tested by `src/db/*.int.spec.ts` against the local Supabase Postgres (`npm run test:int`), not by mocking the client.
