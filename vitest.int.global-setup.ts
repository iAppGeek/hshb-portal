import { resetDatabase } from './src/db/test-db'

export default async function globalSetup(): Promise<void> {
  await resetDatabase()
}
