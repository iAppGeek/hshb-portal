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

  it('sends remoteip in the body when given', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )

    await verifyTurnstileToken('token', '203.0.113.1')

    const [, init] = fetchSpy.mock.calls[0]
    const params = new URLSearchParams(String(init?.body))
    expect(params.get('remoteip')).toBe('203.0.113.1')
  })

  it('omits remoteip when not given', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )

    await verifyTurnstileToken('token')

    const [, init] = fetchSpy.mock.calls[0]
    const params = new URLSearchParams(String(init?.body))
    expect(params.has('remoteip')).toBe(false)
  })

  it('omits remoteip when explicitly null', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )

    await verifyTurnstileToken('token', null)

    const [, init] = fetchSpy.mock.calls[0]
    const params = new URLSearchParams(String(init?.body))
    expect(params.has('remoteip')).toBe(false)
  })

  describe('hostname verification', () => {
    it('returns false when TURNSTILE_EXPECTED_HOSTNAME is set and the hostname differs', async () => {
      vi.stubEnv('TURNSTILE_EXPECTED_HOSTNAME', 'portal.hshb.org.uk')
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, hostname: 'evil.example.com' }),
          { status: 200 },
        ),
      )

      expect(await verifyTurnstileToken('token')).toBe(false)
    })

    it('returns true when TURNSTILE_EXPECTED_HOSTNAME matches the hostname', async () => {
      vi.stubEnv('TURNSTILE_EXPECTED_HOSTNAME', 'portal.hshb.org.uk')
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, hostname: 'portal.hshb.org.uk' }),
          { status: 200 },
        ),
      )

      expect(await verifyTurnstileToken('token')).toBe(true)
    })

    it('ignores hostname when TURNSTILE_EXPECTED_HOSTNAME is unset', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, hostname: 'anything.example.com' }),
          { status: 200 },
        ),
      )

      expect(await verifyTurnstileToken('token')).toBe(true)
    })
  })
})
