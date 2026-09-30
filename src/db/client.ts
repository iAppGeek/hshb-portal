import 'server-only'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '@/env.server'

import * as schema from './schema'

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
/** A reader that runs on its own or inside a caller's transaction. */
export type Queryable = Db | Tx
