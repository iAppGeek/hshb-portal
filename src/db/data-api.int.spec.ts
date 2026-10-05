import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { db } from './client'

// Supabase's public Data API (PostgREST/GraphQL) runs as `anon` or
// `authenticated`. The app never uses it: it connects as postgres. These
// checks run against the database the migrations built (`supabase db reset`).

const PUBLIC = sql`'public'::regnamespace`
const API_ROLES = sql`(values ('anon'), ('authenticated')) as api(role)`

describe('the Supabase Data API roles', () => {
  it('meet row level security on every public table', async () => {
    const tables = await db.execute<{ name: string; rls: boolean }>(sql`
      select relname as name, relrowsecurity as rls from pg_class
      where relnamespace = ${PUBLIC} and relkind in ('r', 'p')`)
    expect(tables.length).toBeGreaterThan(0)
    expect(tables.filter((t) => !t.rls)).toEqual([])
  })

  it('hold no privileges on any public table or view', async () => {
    const granted = await db.execute(sql`
      select api.role, c.relname from pg_class c cross join ${API_ROLES}
      where c.relnamespace = ${PUBLIC} and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and has_table_privilege(api.role, c.oid,
          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`)
    expect(granted).toEqual([])

    const grants = await db.execute(sql`
      select grantee, table_name from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')`)
    expect(grants).toEqual([])
  })

  it('hold no privileges on any public sequence', async () => {
    const granted = await db.execute(sql`
      select api.role, c.relname from pg_class c cross join ${API_ROLES}
      where c.relnamespace = ${PUBLIC} and c.relkind = 'S'
        and has_sequence_privilege(api.role, c.oid, 'USAGE, SELECT, UPDATE')`)
    expect(granted).toEqual([])
  })

  // Functions an extension installed into public (btree_gist's) belong to
  // supabase_admin, whose grants the migrations cannot change; they are
  // operator support, not data.
  it('find no functions of the app in public, so none to call', async () => {
    const functions = await db.execute(sql`
      select p.proname from pg_proc p
      where p.pronamespace = ${PUBLIC}
        and not exists (
          select 1 from pg_depend d
          where d.classid = 'pg_proc'::regclass and d.objid = p.oid
            and d.deptype = 'e')`)
    expect(functions).toEqual([])
  })

  it('get nothing by default on tables, sequences or functions postgres creates in public', async () => {
    const defaults = await db.execute(sql`
      select d.defaclobjtype, a.grantee::regrole::text as grantee
      from pg_default_acl d, aclexplode(d.defaclacl) a
      where d.defaclnamespace = ${PUBLIC}
        and d.defaclrole = 'postgres'::regrole
        and a.grantee in ('anon'::regrole, 'authenticated'::regrole)`)
    expect(defaults).toEqual([])
  })
})
