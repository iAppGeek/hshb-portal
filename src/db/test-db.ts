// Test-only: resets the local Supabase Postgres to supabase/seed.sql for the
// integration specs (src/db/*.int.spec.ts). Never imported by app code.
import { readFileSync } from 'node:fs'
import path from 'node:path'

import postgres from 'postgres'

const LOCAL_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** The deterministic ids in supabase/seed.sql. */
export const SEED = {
  staff: {
    admin: '00000000-0000-0000-0000-000000000001',
    teacher: '00000000-0000-0000-0000-000000000002',
    teacher2: '00000000-0000-0000-0000-000000000003',
    headteacher: '00000000-0000-0000-0000-000000000004',
    secretary: '00000000-0000-0000-0000-000000000005',
  },
  years: {
    current: '05000000-0000-4000-8000-000000000001',
    prior: '05000000-0000-4000-8000-000000000002',
  },
  classes: {
    alpha: '10000000-0000-0000-0000-000000000001',
    beta: '10000000-0000-0000-0000-000000000002',
    gamma: '10000000-0000-0000-0000-000000000003',
  },
  guardians: {
    gary: '20000000-0000-0000-0000-000000000001',
    grace: '20000000-0000-0000-0000-000000000002',
    greg: '20000000-0000-0000-0000-000000000003',
  },
  students: {
    alice: '30000000-0000-0000-0000-000000000001',
    bob: '30000000-0000-0000-0000-000000000002',
    carol: '30000000-0000-0000-0000-000000000003',
  },
  incidents: {
    medical: '60000000-0000-0000-0000-000000000001',
    behaviour: '60000000-0000-0000-0000-000000000002',
  },
  lessonPlan: '70000000-0000-0000-0000-000000000001',
  registrations: {
    pending: '80000000-0000-0000-0000-000000000001',
    rejected: '80000000-0000-0000-0000-000000000002',
  },
  photoOptOut: '82000000-0000-0000-0000-000000000001',
  feePlan: '90000000-0000-0000-0000-000000000001',
  payment: '93000000-0000-0000-0000-000000000001',
} as const

function connectLocal(): postgres.Sql {
  const url = process.env.DATABASE_URL ?? LOCAL_URL
  if (!/@(127\.0\.0\.1|localhost):54322\//.test(url)) {
    throw new Error(
      `Refusing to change ${url}: integration specs only run against the local Supabase database.`,
    )
  }
  return postgres(url, { max: 1, onnotice: () => {} })
}

/**
 * Forces a write to fail part-way through a multi-statement function: while
 * `run` runs, rows of `table` written with `condition` false are rejected (a
 * temporary NOT VALID check constraint, code 23514). Returns what `run` threw,
 * or undefined if it succeeded, so a spec can then assert nothing was left
 * behind.
 */
export async function failWritesTo(
  table: string,
  condition: string,
  run: () => Promise<unknown>,
): Promise<unknown> {
  const sql = connectLocal()
  try {
    await sql.unsafe(
      `alter table public.${table} add constraint forced_failure check (${condition}) not valid`,
    )
    try {
      return await run().then(
        () => undefined,
        (err: unknown) => err,
      )
    } finally {
      await sql.unsafe(
        `alter table public.${table} drop constraint forced_failure`,
      )
    }
  } finally {
    await sql.end()
  }
}

/** Empties every public table and loads the seed data again. */
export async function resetDatabase(): Promise<void> {
  const sql = connectLocal()
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
