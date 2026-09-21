import { describe, it, expect, vi, beforeEach } from 'vitest'

import { getActor } from '@/auth/require'
import { signInStaff, signOutStaff } from '@/db'

vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('@/db', () => ({
  signInStaff: vi.fn(),
  signOutStaff: vi.fn(),
  logAuditEvent: vi.fn(),
}))

import { signInAction, signOutAction } from './actions'

const STAFF_1 = '00000000-0000-4000-8000-000000000001'
const STAFF_2 = '00000000-0000-4000-8000-000000000002'
const ADMIN_1 = '00000000-0000-4000-8000-000000000010'
const SECRETARY_1 = '00000000-0000-4000-8000-000000000020'

beforeEach(() => {
  vi.clearAllMocks()
})

const signedInRow = {
  id: 'sa-1',
  staff_id: STAFF_1,
  date: '2026-03-18',
  signed_in_at: '2026-03-18T09:00:00.000Z',
  signed_out_at: null,
  created_at: '2026-03-18T09:00:00Z',
  updated_at: '2026-03-18T09:00:00Z',
}
const signedOutRow = {
  ...signedInRow,
  signed_out_at: '2026-03-18T17:00:00.000Z',
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

const teacherSession = {
  staffId: STAFF_1,
  role: 'teacher',
  name: null,
  email: '',
}
const adminSession = { staffId: ADMIN_1, role: 'admin', name: null, email: '' }
const secretarySession = {
  staffId: SECRETARY_1,
  role: 'secretary',
  name: null,
  email: '',
}

// ─── signInAction ─────────────────────────────────────────────────────────────

describe('signInAction', () => {
  it('signs in the authenticated staff member', async () => {
    vi.mocked(getActor).mockResolvedValue(teacherSession as any)
    vi.mocked(signInStaff).mockResolvedValue(signedInRow)

    const fd = makeFormData({
      staffId: STAFF_1,
      date: '2026-03-18',
      time: '09:00',
    })

    const result = await signInAction(fd)

    expect(result).toEqual({ data: signedInRow })
    expect(signInStaff).toHaveBeenCalledWith(
      STAFF_1,
      '2026-03-18',
      '2026-03-18T09:00:00.000Z',
    )
  })

  it('returns error when teacher tries to sign in another staff member', async () => {
    vi.mocked(getActor).mockResolvedValue(teacherSession as any)

    const fd = makeFormData({
      staffId: STAFF_2,
      date: '2026-03-18',
      time: '09:00',
    })

    const result = await signInAction(fd)

    expect(result).toEqual({ error: 'Not authorised' })
    expect(signInStaff).not.toHaveBeenCalled()
  })

  it('allows admin to sign in any staff member', async () => {
    vi.mocked(getActor).mockResolvedValue(adminSession as any)
    vi.mocked(signInStaff).mockResolvedValue(signedInRow)

    const fd = makeFormData({
      staffId: STAFF_1,
      date: '2026-03-18',
      time: '09:00',
    })

    const result = await signInAction(fd)

    expect(result).toEqual({ data: signedInRow })
    expect(signInStaff).toHaveBeenCalledWith(
      STAFF_1,
      '2026-03-18',
      '2026-03-18T09:00:00.000Z',
    )
  })

  it('returns error when not authenticated', async () => {
    vi.mocked(getActor).mockResolvedValue(null as any)

    const fd = makeFormData({
      staffId: STAFF_1,
      date: '2026-03-18',
      time: '09:00',
    })
    const result = await signInAction(fd)

    expect(result).toEqual({ error: 'Not authenticated' })
    expect(signInStaff).not.toHaveBeenCalled()
  })

  it('returns error on DB failure', async () => {
    vi.mocked(getActor).mockResolvedValue(teacherSession as any)
    vi.mocked(signInStaff).mockRejectedValue(new Error('DB error'))

    const fd = makeFormData({
      staffId: STAFF_1,
      date: '2026-03-18',
      time: '09:00',
    })
    const result = await signInAction(fd)

    expect(result).toEqual({ error: 'Failed to sign in. Please try again.' })
  })

  it('returns error when required fields are missing', async () => {
    vi.mocked(getActor).mockResolvedValue(teacherSession as any)

    const fd = makeFormData({ staffId: STAFF_1, date: '2026-03-18' }) // no time
    const result = await signInAction(fd)

    expect(result).toMatchObject({ error: expect.stringContaining('Invalid') })
    expect(signInStaff).not.toHaveBeenCalled()
  })

  it('allows secretary to sign themselves in', async () => {
    vi.mocked(getActor).mockResolvedValue(secretarySession as any)
    vi.mocked(signInStaff).mockResolvedValue(signedInRow)

    const fd = makeFormData({
      staffId: SECRETARY_1,
      date: '2026-03-18',
      time: '09:00',
    })

    const result = await signInAction(fd)

    expect(result).toEqual({ data: signedInRow })
    expect(signInStaff).toHaveBeenCalledWith(
      SECRETARY_1,
      '2026-03-18',
      '2026-03-18T09:00:00.000Z',
    )
  })

  it('returns error when secretary tries to sign in another staff member', async () => {
    vi.mocked(getActor).mockResolvedValue(secretarySession as any)

    const fd = makeFormData({
      staffId: STAFF_1,
      date: '2026-03-18',
      time: '09:00',
    })

    const result = await signInAction(fd)

    expect(result).toEqual({ error: 'Not authorised' })
    expect(signInStaff).not.toHaveBeenCalled()
  })
})

// ─── signOutAction ────────────────────────────────────────────────────────────

describe('signOutAction', () => {
  it('signs out the authenticated staff member', async () => {
    vi.mocked(getActor).mockResolvedValue(teacherSession as any)
    vi.mocked(signOutStaff).mockResolvedValue(signedOutRow)

    const fd = makeFormData({
      staffId: STAFF_1,
      date: '2026-03-18',
      time: '17:00',
    })

    const result = await signOutAction(fd)

    expect(result).toEqual({ data: signedOutRow })
    expect(signOutStaff).toHaveBeenCalledWith(
      STAFF_1,
      '2026-03-18',
      '2026-03-18T17:00:00.000Z',
    )
  })

  it('returns error when teacher tries to sign out another staff member', async () => {
    vi.mocked(getActor).mockResolvedValue(teacherSession as any)

    const fd = makeFormData({
      staffId: STAFF_2,
      date: '2026-03-18',
      time: '17:00',
    })
    const result = await signOutAction(fd)

    expect(result).toEqual({ error: 'Not authorised' })
    expect(signOutStaff).not.toHaveBeenCalled()
  })

  it('allows admin to sign out any staff member', async () => {
    vi.mocked(getActor).mockResolvedValue(adminSession as any)
    vi.mocked(signOutStaff).mockResolvedValue(signedOutRow)

    const fd = makeFormData({
      staffId: STAFF_1,
      date: '2026-03-18',
      time: '17:00',
    })
    const result = await signOutAction(fd)

    expect(result).toEqual({ data: signedOutRow })
    expect(signOutStaff).toHaveBeenCalled()
  })

  it('returns error on DB failure', async () => {
    vi.mocked(getActor).mockResolvedValue(teacherSession as any)
    vi.mocked(signOutStaff).mockRejectedValue(new Error('DB error'))

    const fd = makeFormData({
      staffId: STAFF_1,
      date: '2026-03-18',
      time: '17:00',
    })
    const result = await signOutAction(fd)

    expect(result).toEqual({ error: 'Failed to sign out. Please try again.' })
  })

  it('allows secretary to sign themselves out', async () => {
    vi.mocked(getActor).mockResolvedValue(secretarySession as any)
    vi.mocked(signOutStaff).mockResolvedValue(signedOutRow)

    const fd = makeFormData({
      staffId: SECRETARY_1,
      date: '2026-03-18',
      time: '17:00',
    })

    const result = await signOutAction(fd)

    expect(result).toEqual({ data: signedOutRow })
    expect(signOutStaff).toHaveBeenCalledWith(
      SECRETARY_1,
      '2026-03-18',
      '2026-03-18T17:00:00.000Z',
    )
  })

  it('returns null data when there was no sign-in to close', async () => {
    vi.mocked(getActor).mockResolvedValue(teacherSession as any)
    vi.mocked(signOutStaff).mockResolvedValue(null)

    const result = await signOutAction(
      makeFormData({ staffId: STAFF_1, date: '2026-03-18', time: '17:00' }),
    )

    expect(result).toEqual({ data: null })
  })

  it('returns error when secretary tries to sign out another staff member', async () => {
    vi.mocked(getActor).mockResolvedValue(secretarySession as any)

    const fd = makeFormData({
      staffId: STAFF_1,
      date: '2026-03-18',
      time: '17:00',
    })
    const result = await signOutAction(fd)

    expect(result).toEqual({ error: 'Not authorised' })
    expect(signOutStaff).not.toHaveBeenCalled()
  })
})
