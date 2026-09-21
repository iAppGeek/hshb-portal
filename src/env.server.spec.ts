import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

async function loadEnv(): Promise<typeof import('./env.server').env> {
  vi.resetModules()
  const { env } = await import('./env.server')
  return env
}

beforeEach(() => {
  vi.stubEnv('E2E_TEST_SECRET', undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('env.server E2E_TEST', () => {
  it('is off when unset', async () => {
    vi.stubEnv('E2E_TEST', undefined)
    expect((await loadEnv()).E2E_TEST).toBe(false)
  })

  it.each(['', 'false'])('is off when set to %j', async (value) => {
    vi.stubEnv('E2E_TEST', value)
    expect((await loadEnv()).E2E_TEST).toBe(false)
  })

  it('is on when "true" and a secret is set', async () => {
    vi.stubEnv('E2E_TEST', 'true')
    vi.stubEnv('E2E_TEST_SECRET', 'test-secret')
    expect((await loadEnv()).E2E_TEST).toBe(true)
  })

  it('fails when "true" without a secret', async () => {
    vi.stubEnv('E2E_TEST', 'true')
    await expect(loadEnv()).rejects.toThrow(/E2E_TEST_SECRET is required/)
  })

  it('fails on an unrecognised value', async () => {
    vi.stubEnv('E2E_TEST', 'yes')
    await expect(loadEnv()).rejects.toThrow()
  })
})
