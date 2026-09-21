import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getActor } from '@/auth/require'
import {
  updateClass,
  setClassStudents,
  getClassById,
  getCurrentAcademicYear,
} from '@/db'

import { updateClassAction } from './actions'

vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  updateClass: vi.fn(),
  setClassStudents: vi.fn(),
  getClassById: vi.fn(),
  getCurrentAcademicYear: vi.fn(),
  logAuditEvent: vi.fn(),
}))

const CLASS_ID = '00000000-0000-4000-8000-000000000001'
const STAFF_ID = '00000000-0000-4000-8000-000000000010'
const STUDENT_1 = '00000000-0000-4000-8000-000000000020'
const STUDENT_2 = '00000000-0000-4000-8000-000000000030'
const YEAR_ID = '00000000-0000-4000-8000-000000000040'

const adminSession = { staffId: STAFF_ID, role: 'admin', name: null, email: '' }

const currentYear = {
  id: YEAR_ID,
  start_date: '2026-09-01',
  end_date: '2027-08-31',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getActor).mockResolvedValue(adminSession as any)
  vi.mocked(getClassById).mockResolvedValue({
    id: CLASS_ID,
    active: true,
    academic_year_id: YEAR_ID,
  } as any)
  vi.mocked(getCurrentAcademicYear).mockResolvedValue(currentYear as any)
})

function makeFormData(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      value.forEach((v) => fd.append(key, v))
    } else {
      fd.set(key, value)
    }
  }
  return fd
}

const baseFields = {
  name: 'Year 1A',
  year_group: '1',
  room_number: 'R1',
  academic_year_id: YEAR_ID,
  teacher_id: STAFF_ID,
}

describe('updateClassAction', () => {
  it('returns error when not authenticated', async () => {
    vi.mocked(getActor).mockResolvedValue(null as any)

    const result = await updateClassAction(CLASS_ID, makeFormData(baseFields))
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(updateClass).not.toHaveBeenCalled()
  })

  it('returns error when not authorised', async () => {
    vi.mocked(getActor).mockResolvedValue({
      staffId: STAFF_ID,
      role: 'teacher',
      name: null,
      email: '',
    } as any)

    const result = await updateClassAction(CLASS_ID, makeFormData(baseFields))
    expect(result).toEqual({ error: 'Not authorised' })
    expect(updateClass).not.toHaveBeenCalled()
  })

  it('updates class, sets students, revalidates, and redirects', async () => {
    vi.mocked(updateClass).mockResolvedValue(undefined)
    vi.mocked(setClassStudents).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      updateClassAction(CLASS_ID, makeFormData(baseFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateClass).toHaveBeenCalledWith(
      CLASS_ID,
      expect.objectContaining({
        name: 'Year 1A',
        year_group: '1',
        teacher_id: STAFF_ID,
      }),
    )
    // The form may still post a year, but a class's year is never updated.
    expect(vi.mocked(updateClass).mock.calls[0][1]).not.toHaveProperty(
      'academic_year_id',
    )
    expect(vi.mocked(updateClass).mock.calls[0][1]).not.toHaveProperty('active')
    expect(setClassStudents).toHaveBeenCalledWith(CLASS_ID, [])
    expect(revalidatePath).toHaveBeenCalledWith('/classes')
    expect(redirect).toHaveBeenCalledWith('/classes')
  })

  it.each([
    ['an inactive class', { active: false, academic_year_id: YEAR_ID }],
    [
      'an active class from another year',
      {
        active: true,
        academic_year_id: '00000000-0000-4000-8000-000000000041',
      },
    ],
  ])('refuses to edit %s', async (_label, cls) => {
    vi.mocked(getClassById).mockResolvedValue({ id: CLASS_ID, ...cls } as any)

    const result = await updateClassAction(CLASS_ID, makeFormData(baseFields))
    expect(result).toEqual({
      error: 'Only active classes in the current academic year can be edited.',
    })
    expect(updateClass).not.toHaveBeenCalled()
    expect(setClassStudents).not.toHaveBeenCalled()
  })

  it('passes selected student ids to setClassStudents', async () => {
    vi.mocked(updateClass).mockResolvedValue(undefined)
    vi.mocked(setClassStudents).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    const fields = {
      ...baseFields,
      student_ids: [STUDENT_1, STUDENT_2],
    }

    await expect(
      updateClassAction(CLASS_ID, makeFormData(fields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(setClassStudents).toHaveBeenCalledWith(CLASS_ID, [
      STUDENT_1,
      STUDENT_2,
    ])
  })

  it('returns error when updateClass throws', async () => {
    vi.mocked(updateClass).mockRejectedValue(new Error('DB error'))

    const result = await updateClassAction(CLASS_ID, makeFormData(baseFields))
    expect(result).toEqual({
      error: 'Failed to update class. Please try again.',
    })
    expect(redirect).not.toHaveBeenCalled()
  })
})
