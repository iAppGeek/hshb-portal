import { describe, it, expect, vi, beforeEach } from 'vitest'
import { headers } from 'next/headers'

import { getClientIp } from './request-ip'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))

function mockHeaders(values: Record<string, string | undefined>): void {
  vi.mocked(headers).mockResolvedValue({
    get: (name: string) => values[name] ?? null,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getClientIp', () => {
  it('returns the first entry of a comma-separated x-forwarded-for', async () => {
    mockHeaders({ 'x-forwarded-for': '203.0.113.1, 198.51.100.2' })

    expect(await getClientIp()).toBe('203.0.113.1')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    mockHeaders({ 'x-real-ip': '203.0.113.9' })

    expect(await getClientIp()).toBe('203.0.113.9')
  })

  it('returns null when neither header is present', async () => {
    mockHeaders({})

    expect(await getClientIp()).toBeNull()
  })
})
