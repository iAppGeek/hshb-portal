import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateTag } from 'next/cache'

import { getActor } from '@/auth/require'

import { revalidateAllCaches } from './actions'

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ logAuditEvent: vi.fn() }))
vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('next/cache', () => ({ updateTag: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('revalidateAllCaches', () => {
  it('does nothing without a session', async () => {
    vi.mocked(getActor).mockResolvedValue(null as never)

    await revalidateAllCaches()

    expect(updateTag).not.toHaveBeenCalled()
  })

  it('revalidates every cached data set when a session exists', async () => {
    vi.mocked(getActor).mockResolvedValue({
      staffId: 'staff-1',
      role: 'admin',
      name: null,
      email: '',
    } as never)

    await revalidateAllCaches()

    expect(vi.mocked(updateTag).mock.calls.map(([tag]) => tag)).toEqual([
      'students',
      'classes',
      'staff',
      'staff-payroll',
      'fee-plans',
      'student-fees',
      'academic-years',
    ])
  })
})
