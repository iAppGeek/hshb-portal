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
    // Room for a page's parallel queries (Promise.all) to each take their own
    // connection. With fewer, postgres.js pipelines the extras onto a busy
    // connection, and through the Supavisor transaction pooler a pipelined
    // query with parameters can be stranded half-sent: the request then hangs
    // until the function times out. Connections open only when needed.
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  })
if (env.NODE_ENV !== 'production') globalForDb.sql = sql

export const db = drizzle(sql, { schema, casing: 'snake_case' })
export type Db = typeof db
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Kept until plan 10, for the remaining RPC calls only. */
export { supabase } from './supabase-client'
