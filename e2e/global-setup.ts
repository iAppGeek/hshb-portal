import { execSync } from 'child_process'

import postgres from 'postgres'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

async function waitForDatabase(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const sql = postgres(DATABASE_URL, {
      max: 1,
      connect_timeout: 2,
      onnotice: () => {},
    })
    try {
      await sql`select 1`
      return
    } catch {
      // not ready yet
    } finally {
      await sql.end()
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(
    `The local database did not become ready within ${timeoutMs}ms at ${DATABASE_URL}.\nRun: npm run supabase:start`,
  )
}

export default async function globalSetup(): Promise<void> {
  // Verify the local Supabase database is reachable before running any tests
  await waitForDatabase()

  // Reset DB to clean seed state before the full test suite
  execSync('npx supabase db reset --local', { stdio: 'inherit' })

  // db reset restarts containers — wait for the database to be ready again
  await waitForDatabase()
}
