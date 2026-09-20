# 01 — Remove the orphaned Timetables page

| Delivers | Cx  | Reuse | Arch | Size | Depends on |
| -------- | :-: | :---: | :--: | :--: | ---------- |
| E4       |  4  |   2   |  4   |  S   | —          |

## Goal

Delete a feature that is not reachable from the UI and has no write path, so it isn't carried
through the rest of the refactor (schema bootstrap in plan 09, routes config in plan 06).

## Evidence

- `/timetables` is not in `navItems` in `src/app/layout.tsx` and no `<Link>` in `src/app` points to
  it. It's reachable only by typing the URL.
- `src/app/timetables/page.tsx` renders `timetable_slots` read-only; its "Add slot" button is
  permanently disabled. There is no form, no server action, no `db` write function.
- `canEditTimetables` in `src/lib/permissions.ts` gates nothing.
- The page and table arrived in the initial "migrate portal routes to root" commit.

## Scope

**In:** page, loading skeleton, DB module, table, seed rows, permission, docs, tests.
**Out:** building a real timetable feature (if wanted later, do it on plans 04/05's form kit).

## Implementation steps

1. Delete `src/app/timetables/` (page.tsx, loading.tsx, any spec files).
2. Delete `src/db/timetable.ts` and remove its exports (`getAllTimetableSlots`,
   `getTimetableByClass`) from `src/db/index.ts`.
3. Remove `canEditTimetables` from `src/lib/permissions.ts` and the "Edit timetables" row from
   `src/lib/PERMISSIONS.md`. Remove any spec assertions for it.
4. Add migration `supabase/migrations/<YYYYMMDDHHmmss>_drop_timetable_slots.sql`:
   ```sql
   DROP TABLE IF EXISTS public.timetable_slots;
   ```
5. Remove the `timetable_slots` block from `supabase/seed.sql`.
6. Regenerate `supabase/schema.sql` and `src/types/database.ts` after `npm run supabase:reset`:
   `npx supabase db dump --local --schema public -f supabase/schema.sql`, then **`npm run gen:types`**
   (not a bare `supabase gen types` redirect — that strips the header comment at the top of
   `database.ts`). Verify `Tables<'timetable_slots'>` no longer exists.
7. Remove `/timetables` from `proxy.spec.ts` or `sidebar.e2e.ts` if referenced.
8. Update `README.md` (the "Handles students, staff, classes, attendance, lesson plans, incidents,
   timetables, reports…" sentence).

## Acceptance criteria

- `rg -i timetable src supabase e2e README.md` returns nothing except historical migration files.
- `npm run pipeline:check` passes.
- Visiting `/timetables` returns the Next.js 404 page.
