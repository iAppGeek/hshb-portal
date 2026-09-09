import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import { purgeActionedSubmissions, logAuditEvent } from '@/db'

import { purgeActionedSubmissionsAction } from './actions'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  purgeActionedSubmissions: vi.fn(),
  logAuditEvent: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('purgeActionedSubmissionsAction', () => {
  it('returns error when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const result = await purgeActionedSubmissionsAction()

    expect(result).toEqual({ error: 'Not authenticated' })
    expect(purgeActionedSubmissions).not.toHaveBeenCalled()
  })

  it('returns error when role cannot access admin tasks', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: 'staff-1', role: 'teacher' },
    } as never)

    const result = await purgeActionedSubmissionsAction()

    expect(result).toEqual({ error: 'Not authorised' })
    expect(purgeActionedSubmissions).not.toHaveBeenCalled()
  })

  it('purges, audits with the count, and revalidates on success', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: 'staff-1', role: 'admin' },
    } as never)
    vi.mocked(purgeActionedSubmissions).mockResolvedValue(7)

    const result = await purgeActionedSubmissionsAction()

    expect(result).toEqual({ success: true, removed: 7 })
    expect(purgeActionedSubmissions).toHaveBeenCalled()
    expect(logAuditEvent).toHaveBeenCalledWith({
      staffId: 'staff-1',
      action: 'submissions_purged',
      entity: 'registration_submission',
      details: { removed: 7, olderThanDays: 90 },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/registrations')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
  })

  it('returns a friendly error when the purge throws', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: 'staff-1', role: 'admin' },
    } as never)
    vi.mocked(purgeActionedSubmissions).mockRejectedValue(new Error('boom'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await purgeActionedSubmissionsAction()

    expect(result).toEqual({
      error: 'Failed to purge actioned submissions. Please try again.',
    })
    consoleSpy.mockRestore()
  })
})
