import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateTag } from 'next/cache'

import { auth } from '@/auth'

import { revalidateAllCaches } from './actions'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ updateTag: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('revalidateAllCaches', () => {
  it('does nothing without a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    await revalidateAllCaches()

    expect(updateTag).not.toHaveBeenCalled()
  })

  it('revalidates students, classes and staff when a session exists', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: 'staff-1', role: 'admin' },
    } as never)

    await revalidateAllCaches()

    expect(updateTag).toHaveBeenCalledTimes(3)
    expect(updateTag).toHaveBeenCalledWith('students')
    expect(updateTag).toHaveBeenCalledWith('classes')
    expect(updateTag).toHaveBeenCalledWith('staff')
  })
})
