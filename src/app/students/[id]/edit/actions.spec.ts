import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getActor } from '@/auth/require'
import {
  createGuardian,
  getGuardianById,
  getStudentById,
  updateStudent,
  updateStudentClasses,
  markStudentAsLeaver,
} from '@/db'

import { updateStudentAction, markStudentAsLeaverAction } from './actions'

vi.mock('server-only', () => ({}))
vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  createGuardian: vi.fn(),
  getGuardianById: vi.fn(),
  getStudentById: vi.fn(),
  updateStudent: vi.fn(),
  updateStudentClasses: vi.fn(),
  markStudentAsLeaver: vi.fn(),
  logAuditEvent: vi.fn(),
}))

const STUDENT_ID = '00000000-0000-4000-8000-000000000001'
const GUARDIAN_1 = '00000000-0000-4000-8000-000000000010'
const NEW_GUARDIAN = '00000000-0000-4000-8000-000000000020'
const CLASS_1 = '00000000-0000-4000-8000-000000000030'
const CLASS_2 = '00000000-0000-4000-8000-000000000040'

const adminSession = {
  staffId: 'admin-1',
  role: 'admin',
  name: null,
  email: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getActor).mockResolvedValue(adminSession as any)
  vi.mocked(getStudentById).mockResolvedValue({ active: true } as any)
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

const baseFields: Record<string, string> = {
  student_first_name: 'Anna',
  student_last_name: 'Smith',
  student_code: 'S001',
  student_english_school_name: 'St Marys Primary',
  student_date_of_birth: '',
  address_guardian_id: '',
  student_address_line_1: '1 Main Street',
  student_address_line_2: '',
  student_city: 'London',
  student_postcode: 'EC1A 1BB',
  student_allergies: '',
  student_medical_details: '',
  student_notes: '',
  primary_mode: 'existing',
  primary_existing_id: GUARDIAN_1,
  primary_relationship: 'Mother',
  has_secondary: 'false',
  has_contact1: 'false',
  has_contact2: 'false',
}

describe('updateStudentAction', () => {
  it('returns error when not authenticated', async () => {
    vi.mocked(getActor).mockResolvedValue(null as any)

    const result = await updateStudentAction(
      STUDENT_ID,
      makeFormData(baseFields),
    )
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(updateStudent).not.toHaveBeenCalled()
  })

  it('returns error when not authorised', async () => {
    vi.mocked(getActor).mockResolvedValue({
      staffId: 'teacher-1',
      role: 'teacher',
      name: null,
      email: '',
    } as any)

    const result = await updateStudentAction(
      STUDENT_ID,
      makeFormData(baseFields),
    )
    expect(result).toEqual({ error: 'Not authorised' })
    expect(updateStudent).not.toHaveBeenCalled()
  })

  it('updates student and redirects on success', async () => {
    vi.mocked(updateStudent).mockResolvedValue(undefined)
    vi.mocked(updateStudentClasses).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      updateStudentAction(STUDENT_ID, makeFormData(baseFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateStudent).toHaveBeenCalledWith(
      STUDENT_ID,
      expect.objectContaining({
        first_name: 'Anna',
        last_name: 'Smith',
        primary_guardian_id: GUARDIAN_1,
      }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/students')
    expect(redirect).toHaveBeenCalledWith('/students')
  })

  it('forwards the submitted consent booleans to updateStudent', async () => {
    vi.mocked(updateStudent).mockResolvedValue(undefined)
    vi.mocked(updateStudentClasses).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    const fields = {
      ...baseFields,
      consent_privacy_notice: 'on',
      consent_emergency_first_aid: 'on',
    }

    await expect(
      updateStudentAction(STUDENT_ID, makeFormData(fields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateStudent).toHaveBeenCalledWith(
      STUDENT_ID,
      expect.objectContaining({
        consent_privacy_notice: true,
        consent_emergency_first_aid: true,
        consent_photo_media: false,
        consent_home_school: false,
        consent_comms_email_sms: false,
      }),
    )
  })

  it('updates class enrollments with submitted class ids', async () => {
    vi.mocked(updateStudent).mockResolvedValue(undefined)
    vi.mocked(updateStudentClasses).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    const fields = { ...baseFields, class_ids: [CLASS_1, CLASS_2] }

    await expect(
      updateStudentAction(STUDENT_ID, makeFormData(fields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateStudentClasses).toHaveBeenCalledWith(STUDENT_ID, [
      CLASS_1,
      CLASS_2,
    ])
  })

  it('creates a new guardian when mode is new', async () => {
    vi.mocked(createGuardian).mockResolvedValue({ id: NEW_GUARDIAN })
    vi.mocked(updateStudent).mockResolvedValue(undefined)
    vi.mocked(updateStudentClasses).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    const fields = {
      ...baseFields,
      primary_mode: 'new',
      primary_first_name: 'Jane',
      primary_last_name: 'Doe',
      primary_phone: '07700 900000',
      primary_email: 'jane@example.com',
      primary_occupation: 'Teacher',
    }

    await expect(
      updateStudentAction(STUDENT_ID, makeFormData(fields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createGuardian).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: 'Jane',
        last_name: 'Doe',
        occupation: 'Teacher',
      }),
    )
    expect(updateStudent).toHaveBeenCalledWith(
      STUDENT_ID,
      expect.objectContaining({
        primary_guardian_id: NEW_GUARDIAN,
      }),
    )
  })

  it('returns error when update throws', async () => {
    vi.mocked(updateStudent).mockRejectedValue(new Error('DB error'))
    vi.mocked(updateStudentClasses).mockResolvedValue(undefined)

    const result = await updateStudentAction(
      STUDENT_ID,
      makeFormData(baseFields),
    )
    expect(result).toEqual({
      error: 'Failed to save student. Please try again.',
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('sets address_guardian_id to primary guardian id when slot is primary', async () => {
    vi.mocked(getGuardianById).mockResolvedValue({
      id: GUARDIAN_1,
      first_name: 'Maria',
      last_name: 'Smith',
      phone: '07700 900000',
      address_line_1: '1 Main Street',
      city: 'London',
      postcode: 'EC1A 1BB',
    } as any)
    vi.mocked(updateStudent).mockResolvedValue(undefined)
    vi.mocked(updateStudentClasses).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      updateStudentAction(
        STUDENT_ID,
        makeFormData({
          ...baseFields,
          address_guardian_id: 'primary',
          student_address_line_1: '',
          student_city: '',
          student_postcode: '',
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateStudent).toHaveBeenCalledWith(
      STUDENT_ID,
      expect.objectContaining({
        address_guardian_id: GUARDIAN_1,
        address_line_1: null,
        city: null,
        postcode: null,
      }),
    )
  })

  it('returns error when selected guardian has no address', async () => {
    vi.mocked(getGuardianById).mockResolvedValue({
      id: GUARDIAN_1,
      first_name: 'Maria',
      last_name: 'Smith',
      phone: '07700 900000',
      address_line_1: null,
      city: null,
      postcode: null,
    } as any)

    const result = await updateStudentAction(
      STUDENT_ID,
      makeFormData({
        ...baseFields,
        address_guardian_id: 'primary',
        student_address_line_1: '',
        student_city: '',
        student_postcode: '',
      }),
    )

    expect(result).toEqual({
      error: expect.stringContaining('does not have an address'),
    })
    expect(updateStudent).not.toHaveBeenCalled()
  })

  it('returns error when both address_guardian_id and own address are absent', async () => {
    const result = await updateStudentAction(
      STUDENT_ID,
      makeFormData({
        ...baseFields,
        address_guardian_id: '',
        student_address_line_1: '',
        student_city: '',
        student_postcode: '',
      }),
    )

    expect(result).toEqual({
      error: expect.stringContaining('Enter an address'),
    })
    expect(updateStudent).not.toHaveBeenCalled()
  })

  it('does not touch class enrolments for an inactive student', async () => {
    vi.mocked(getStudentById).mockResolvedValue({ active: false } as any)
    vi.mocked(updateStudent).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      updateStudentAction(STUDENT_ID, makeFormData(baseFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateStudentClasses).not.toHaveBeenCalled()
  })
})

describe('markStudentAsLeaverAction', () => {
  beforeEach(() => {
    vi.mocked(getActor).mockResolvedValue(adminSession as any)
  })

  it('returns error when not authenticated', async () => {
    vi.mocked(getActor).mockResolvedValue(null as any)

    const result = await markStudentAsLeaverAction(
      STUDENT_ID,
      makeFormData({ reason: 'left' }),
    )
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(markStudentAsLeaver).not.toHaveBeenCalled()
  })

  it('returns error when not authorised', async () => {
    vi.mocked(getActor).mockResolvedValue({
      staffId: 'teacher-1',
      role: 'teacher',
      name: null,
      email: '',
    } as any)

    const result = await markStudentAsLeaverAction(
      STUDENT_ID,
      makeFormData({ reason: 'left' }),
    )
    expect(result).toEqual({ error: 'Not authorised' })
    expect(markStudentAsLeaver).not.toHaveBeenCalled()
  })

  it('rejects an invalid reason', async () => {
    const result = await markStudentAsLeaverAction(
      STUDENT_ID,
      makeFormData({ reason: 'expelled' }),
    )
    expect(result).toMatchObject({ error: expect.any(String) })
    expect(markStudentAsLeaver).not.toHaveBeenCalled()
  })

  it('marks the student as a leaver, logs, revalidates and redirects', async () => {
    vi.mocked(markStudentAsLeaver).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      markStudentAsLeaverAction(
        STUDENT_ID,
        makeFormData({ reason: 'graduated' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(markStudentAsLeaver).toHaveBeenCalledWith(STUDENT_ID, 'graduated')
    expect(revalidatePath).toHaveBeenCalledWith('/students')
    expect(redirect).toHaveBeenCalledWith('/students')
  })

  it('returns a user-friendly error when markStudentAsLeaver throws', async () => {
    vi.mocked(markStudentAsLeaver).mockRejectedValue(new Error('DB error'))

    const result = await markStudentAsLeaverAction(
      STUDENT_ID,
      makeFormData({ reason: 'left' }),
    )
    expect(result).toEqual({
      error: 'Failed to mark student as a leaver. Please try again.',
    })
    expect(redirect).not.toHaveBeenCalled()
  })
})
