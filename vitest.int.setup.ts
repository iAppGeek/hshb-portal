import { afterAll } from 'vitest'

import { db } from './src/db/client'

// Close this file's connection so the worker can exit straight away.
afterAll(async () => {
  await db.$client.end()
})
