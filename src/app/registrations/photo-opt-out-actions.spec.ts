import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  applyPhotoOptOut,
  rejectPhotoOptOut,
  deletePhotoOptOut,
  getPhotoOptOutById,
  logAuditEvent,
} from '@/db'

import {
  applyPhotoOptOutAction,
  rejectPhotoOptOutAction,
  deletePhotoOptOutAction,
} from './photo-opt-out-actions'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  applyPhotoOptOut: vi.fn(),
  rejectPhotoOptOut: vi.fn(),
  deletePhotoOptOut: vi.fn(),
  getPhotoOptOutById: vi.fn(),
  logAuditEvent: vi.fn(),
}))

const STAFF_ID = '00000000-0000-4000-8000-000000000001'
const REQUEST_ID = '00000000-0000-4000-8000-000000000010'
const STUDENT_ID = '00000000-0000-4000-8000-000000000020'

const adminSession = { user: { staffId: STAFF_ID, role: 'admin' } }

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value)
  }
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(adminSession as never)
  vi.mocked(redirect).mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  })
})

describe('applyPhotoOptOutAction', () => {
  it('returns error when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const result = await applyPhotoOptOutAction(
      REQUEST_ID,
      makeFormData({ student_id: STUDENT_ID }),
    )
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(applyPhotoOptOut).not.toHaveBeenCalled()
  })

  it('returns error when role is secretary', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: STAFF_ID, role: 'secretary' },
    } as never)

    const result = await applyPhotoOptOutAction(
      REQUEST_ID,
      makeFormData({ student_id: STUDENT_ID }),
    )
    expect(result).toEqual({ error: 'Not authorised' })
  })

  it('returns a zod error for an invalid student id', async () => {
    const result = await applyPhotoOptOutAction(
      REQUEST_ID,
      makeFormData({ student_id: 'not-a-uuid' }),
    )
    expect(result?.error).toBeDefined()
    expect(applyPhotoOptOut).not.toHaveBeenCalled()
  })

  it('returns a friendly error when the RPC throws', async () => {
    vi.mocked(applyPhotoOptOut).mockRejectedValue(
      new Error('Request not found or already actioned'),
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await applyPhotoOptOutAction(
      REQUEST_ID,
      makeFormData({ student_id: STUDENT_ID }),
    )
    expect(result).toEqual({
      error: 'Failed to apply the opt-out. Please try again.',
    })
    consoleSpy.mockRestore()
  })

  it('applies, audits, and redirects on success', async () => {
    vi.mocked(applyPhotoOptOut).mockResolvedValue(STUDENT_ID)

    await expect(
      applyPhotoOptOutAction(
        REQUEST_ID,
        makeFormData({ student_id: STUDENT_ID }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(applyPhotoOptOut).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      staffId: STAFF_ID,
      studentId: STUDENT_ID,
    })
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'photo_opt_out_applied' }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/registrations')
    expect(redirect).toHaveBeenCalledWith('/registrations')
  })
})

describe('rejectPhotoOptOutAction', () => {
  it('returns error when not authorised', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: STAFF_ID, role: 'teacher' },
    } as never)

    const result = await rejectPhotoOptOutAction(
      REQUEST_ID,
      makeFormData({ reason: 'Cannot match' }),
    )
    expect(result).toEqual({ error: 'Not authorised' })
    expect(rejectPhotoOptOut).not.toHaveBeenCalled()
  })

  it('rejects, audits, and redirects on success', async () => {
    vi.mocked(rejectPhotoOptOut).mockResolvedValue(undefined)

    await expect(
      rejectPhotoOptOutAction(
        REQUEST_ID,
        makeFormData({ reason: 'Cannot match' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(rejectPhotoOptOut).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      staffId: STAFF_ID,
      reason: 'Cannot match',
    })
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'photo_opt_out_rejected' }),
    )
    expect(redirect).toHaveBeenCalledWith('/registrations')
  })
})

describe('deletePhotoOptOutAction', () => {
  it('returns error when not authorised', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: STAFF_ID, role: 'headteacher' },
    } as never)

    const result = await deletePhotoOptOutAction(REQUEST_ID)
    expect(result).toEqual({ error: 'Not authorised' })
    expect(deletePhotoOptOut).not.toHaveBeenCalled()
  })

  it('deletes, audits with the child name, and redirects', async () => {
    vi.mocked(getPhotoOptOutById).mockResolvedValue({
      child_first_name: 'Alice',
      child_last_name: 'Student',
    } as never)
    vi.mocked(deletePhotoOptOut).mockResolvedValue(undefined)

    await expect(deletePhotoOptOutAction(REQUEST_ID)).rejects.toThrow(
      'NEXT_REDIRECT',
    )

    expect(deletePhotoOptOut).toHaveBeenCalledWith(REQUEST_ID)
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'photo_opt_out_deleted',
        details: { childName: 'Alice Student' },
      }),
    )
    expect(redirect).toHaveBeenCalledWith('/registrations')
  })
})
