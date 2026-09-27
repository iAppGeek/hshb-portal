// Test-only: resets the local Supabase Postgres to supabase/seed.sql for the
// integration specs (src/db/*.int.spec.ts). Never imported by app code.
import { readFileSync } from 'node:fs'
import path from 'node:path'

import postgres from 'postgres'

const LOCAL_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** Empties every public table and loads the seed data again. */
export async function resetDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL ?? LOCAL_URL
  if (!/@(127\.0\.0\.1|localhost):54322\//.test(url)) {
    throw new Error(
      `Refusing to reset ${url}: integration specs only run against the local Supabase database.`,
    )
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const tables = await sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'`
    const names = tables.map((t) => `public."${t.tablename}"`).join(', ')
    const seed = readFileSync(
      path.resolve(__dirname, '../../supabase/seed.sql'),
      'utf-8',
    )
    await sql.begin(async (tx) => {
      await tx.unsafe(`truncate ${names} restart identity cascade`)
      await tx.unsafe(seed)
    })
  } finally {
    await sql.end()
  }
}
