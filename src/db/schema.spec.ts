import { is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import * as schema from './schema'

const tables = Object.values(schema).filter((value) => is(value, PgTable))

describe('schema', () => {
  it('exports its tables', () => {
    expect(tables.length).toBeGreaterThan(0)
  })

  // RLS with no policies denies Supabase's public Data API. The app connects
  // as postgres, which bypasses RLS, so this never restricts the app.
  it.each(tables.map((table) => [getTableConfig(table).name, table] as const))(
    '%s enables row level security',
    (_name, table) => {
      expect(getTableConfig(table).enableRLS).toBe(true)
    },
  )
})
