import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { verifyTurnstileToken } from './turnstile'

describe('verifyTurnstileToken', () => {
  beforeEach(() => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns true when Cloudflare reports success', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )

    expect(await verifyTurnstileToken('token')).toBe(true)
  })

  it('returns false when Cloudflare reports failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    )

    expect(await verifyTurnstileToken('token')).toBe(false)
  })

  it('returns false on a non-2xx response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 500 }),
    )

    expect(await verifyTurnstileToken('token')).toBe(false)
  })

  it('returns false when fetch throws', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'))

    expect(await verifyTurnstileToken('token')).toBe(false)
  })
})
