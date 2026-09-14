import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  createAcademicYear,
  updateAcademicYear,
  setCurrentAcademicYear,
  logAuditEvent,
} from '@/db'

import {
  createAcademicYearAction,
  updateAcademicYearAction,
  setCurrentAcademicYearAction,
} from './actions'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  createAcademicYear: vi.fn(),
  updateAcademicYear: vi.fn(),
  setCurrentAcademicYear: vi.fn(),
  logAuditEvent: vi.fn(),
}))

const STAFF_ID = '00000000-0000-4000-8000-000000000001'
const YEAR_ID = '00000000-0000-4000-8000-000000000010'

const adminSession = { user: { staffId: STAFF_ID, role: 'admin' } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(adminSession as any)
})

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

describe('createAcademicYearAction', () => {
  const fields = {
    code: '2027-28',
    start_date: '2027-09-01',
    end_date: '2028-08-31',
  }

  it('returns error when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    const result = await createAcademicYearAction(makeFormData(fields))
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(createAcademicYear).not.toHaveBeenCalled()
  })

  it('returns error when not authorised', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: STAFF_ID, role: 'teacher' },
    } as any)

    const result = await createAcademicYearAction(makeFormData(fields))
    expect(result).toEqual({ error: 'Not authorised' })
    expect(createAcademicYear).not.toHaveBeenCalled()
  })

  it('rejects an end date before the start date', async () => {
    const result = await createAcademicYearAction(
      makeFormData({ ...fields, end_date: '2027-08-01' }),
    )
    expect(result).toHaveProperty('error')
    expect(createAcademicYear).not.toHaveBeenCalled()
  })

  it('creates the year, logs an audit event, and redirects', async () => {
    vi.mocked(createAcademicYear).mockResolvedValue({ id: YEAR_ID })
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      createAcademicYearAction(makeFormData(fields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createAcademicYear).toHaveBeenCalledWith({
      code: '2027-28',
      start_date: '2027-09-01',
      end_date: '2028-08-31',
    })
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: STAFF_ID,
        action: 'create',
        entity: 'academic_year',
        entityId: YEAR_ID,
      }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/admin')
    expect(redirect).toHaveBeenCalledWith('/admin?tab=academic-years')
  })

  it('returns a friendly error when createAcademicYear throws', async () => {
    vi.mocked(createAcademicYear).mockRejectedValue(new Error('boom'))

    const result = await createAcademicYearAction(makeFormData(fields))
    expect(result).toEqual({
      error: 'Failed to create academic year. Please try again.',
    })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('updateAcademicYearAction', () => {
  const fields = { start_date: '2025-09-01', end_date: '2026-08-31' }

  it('returns error when not authorised', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: STAFF_ID, role: 'teacher' },
    } as any)

    const result = await updateAcademicYearAction(YEAR_ID, makeFormData(fields))
    expect(result).toEqual({ error: 'Not authorised' })
    expect(updateAcademicYear).not.toHaveBeenCalled()
  })

  it('updates the dates, logs an audit event, and redirects', async () => {
    vi.mocked(updateAcademicYear).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      updateAcademicYearAction(YEAR_ID, makeFormData(fields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateAcademicYear).toHaveBeenCalledWith(YEAR_ID, fields)
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: STAFF_ID,
        action: 'update',
        entity: 'academic_year',
        entityId: YEAR_ID,
      }),
    )
    expect(redirect).toHaveBeenCalledWith('/admin?tab=academic-years')
  })

  it('returns a friendly error when updateAcademicYear throws', async () => {
    vi.mocked(updateAcademicYear).mockRejectedValue(new Error('boom'))

    const result = await updateAcademicYearAction(YEAR_ID, makeFormData(fields))
    expect(result).toEqual({
      error: 'Failed to update academic year. Please try again.',
    })
  })
})

describe('setCurrentAcademicYearAction', () => {
  const PREVIOUS_ID = '00000000-0000-4000-8000-000000000020'

  it('returns error when not authorised', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: STAFF_ID, role: 'teacher' },
    } as any)

    const result = await setCurrentAcademicYearAction(YEAR_ID, PREVIOUS_ID)
    expect(result).toEqual({ error: 'Not authorised' })
    expect(setCurrentAcademicYear).not.toHaveBeenCalled()
  })

  it('sets the current year, logs an audit event, and revalidates', async () => {
    vi.mocked(setCurrentAcademicYear).mockResolvedValue(undefined)

    const result = await setCurrentAcademicYearAction(YEAR_ID, PREVIOUS_ID)
    expect(result).toBeUndefined()

    expect(setCurrentAcademicYear).toHaveBeenCalledWith(YEAR_ID)
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: STAFF_ID,
        action: 'update',
        entity: 'academic_year',
        entityId: YEAR_ID,
        details: { previous: PREVIOUS_ID, current: YEAR_ID },
      }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/admin')
    expect(revalidatePath).toHaveBeenCalledWith('/classes')
    expect(revalidatePath).toHaveBeenCalledWith('/attendance')
    expect(revalidatePath).toHaveBeenCalledWith('/finance')
  })

  it('returns a friendly error when setCurrentAcademicYear throws', async () => {
    vi.mocked(setCurrentAcademicYear).mockRejectedValue(new Error('boom'))

    const result = await setCurrentAcademicYearAction(YEAR_ID, PREVIOUS_ID)
    expect(result).toEqual({
      error: 'Failed to set the current academic year. Please try again.',
    })
  })
})
