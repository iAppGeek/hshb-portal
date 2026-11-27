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
    // postgres.js 4 pipelines up to 100 queries per connection by default,
    // and Supavisor before 2.10 hangs on pipelined queries in transaction
    // mode. With one query per connection, a busy pool queues the extras
    // instead of pipelining them.
    max_pipeline: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  })
if (env.NODE_ENV !== 'production') globalForDb.sql = sql

export const db = drizzle(sql, { schema, casing: 'snake_case' })
export type Db = typeof db
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** A reader that runs on its own or inside a caller's transaction. */
export type Queryable = Db | Tx
