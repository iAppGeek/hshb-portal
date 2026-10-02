import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'

import { getActor } from '@/auth/require'
import {
  createGuardian,
  createStudent,
  getGuardianById,
  getStudentById,
  isStudentCodeTaken,
  updateStudent,
  updateStudentClasses,
  markStudentAsLeaver,
} from '@/db'

import { saveStudentAction, markStudentAsLeaverAction } from './actions'

vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn(),
}))
vi.mock('@/db', () => ({
  createGuardian: vi.fn(),
  createStudent: vi.fn(),
  getGuardianById: vi.fn(),
  getStudentById: vi.fn(),
  isStudentCodeTaken: vi.fn(),
  updateStudent: vi.fn(),
  updateStudentClasses: vi.fn(),
  markStudentAsLeaver: vi.fn(),
  logAuditEvent: vi.fn(),
}))

const GUARDIAN_1 = '00000000-0000-4000-8000-000000000001'
const GUARDIAN_2 = '00000000-0000-4000-8000-000000000002'
const CONTACT_1 = '00000000-0000-4000-8000-000000000003'
const NEW_GUARDIAN = '00000000-0000-4000-8000-000000000020'
const CLASS_1 = '00000000-0000-4000-8000-000000000030'
const CLASS_2 = '00000000-0000-4000-8000-000000000040'
const GUARDIAN_EXISTING = '00000000-0000-4000-8000-000000000099'
const STUDENT_ID = '00000000-0000-4000-8000-000000000100'

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
  vi.mocked(isStudentCodeTaken).mockResolvedValue(false)
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

// createFields uses own address (address_guardian_id empty)
const createFields = {
  student_first_name: 'Anna',
  student_last_name: 'Smith',
  student_code: ' GK-1001 ',
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
  primary_first_name: 'Maria',
  primary_last_name: 'Smith',
  primary_phone: '07700 900000',
  primary_email: 'maria@example.com',
  primary_occupation: 'Teacher',
  primary_address_line_1: '',
  primary_address_line_2: '',
  primary_city: '',
  primary_postcode: '',
  primary_relationship: 'Mother',
  has_secondary: 'false',
  has_contact1: 'false',
  has_contact2: 'false',
}

// fields using primary guardian as address source
const createGuardianAddressFields = {
  ...createFields,
  address_guardian_id: 'primary',
  student_address_line_1: '',
  student_city: '',
  student_postcode: '',
  primary_address_line_1: '99 Guardian Rd',
  primary_city: 'Bristol',
  primary_postcode: 'BS1 1AA',
}

const updateFields: Record<string, string> = {
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

// ─── saveStudentAction: create ──────────────────────────────────────────────

describe('saveStudentAction (create)', () => {
  it('returns error when not authenticated', async () => {
    vi.mocked(getActor).mockResolvedValue(null as any)

    const result = await saveStudentAction(null, makeFormData(createFields))
    expect(result).toEqual({ error: 'Not authenticated' })
    expect(createStudent).not.toHaveBeenCalled()
  })

  it('returns error when not authorised', async () => {
    vi.mocked(getActor).mockResolvedValue({
      staffId: 'teacher-1',
      role: 'teacher',
      name: null,
      email: '',
    } as any)

    const result = await saveStudentAction(null, makeFormData(createFields))
    expect(result).toEqual({ error: 'Not authorised' })
    expect(createStudent).not.toHaveBeenCalled()
  })

  it('creates primary guardian and student, then redirects', async () => {
    vi.mocked(createGuardian).mockResolvedValue({ id: GUARDIAN_1 } as any)
    vi.mocked(createStudent).mockResolvedValue({ id: STUDENT_ID } as any)

    await saveStudentAction(null, makeFormData(createFields))

    expect(createGuardian).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: 'Maria',
        last_name: 'Smith',
        phone: '07700 900000',
        email: 'maria@example.com',
      }),
    )
    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: 'Anna',
        last_name: 'Smith',
        primary_guardian_id: GUARDIAN_1,
        primary_guardian_relationship: 'Mother',
        secondary_guardian_id: null,
        additional_contact_1_id: null,
        additional_contact_2_id: null,
      }),
    )
    expect(redirect).toHaveBeenCalledWith('/students')
  })

  it('passes the English school name through to createStudent', async () => {
    vi.mocked(createGuardian).mockResolvedValue({ id: GUARDIAN_1 } as any)
    vi.mocked(createStudent).mockResolvedValue({ id: STUDENT_ID } as any)

    await saveStudentAction(null, makeFormData(createFields))

    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({ english_school_name: 'St Marys Primary' }),
    )
  })

  it('creates a student without an English school name', async () => {
    vi.mocked(createGuardian).mockResolvedValue({ id: GUARDIAN_1 } as any)
    vi.mocked(createStudent).mockResolvedValue({ id: STUDENT_ID } as any)

    const result = await saveStudentAction(
      null,
      makeFormData({ ...createFields, student_english_school_name: '' }),
    )

    expect(result).toBeUndefined()
    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({ english_school_name: null }),
    )
  })

  it('passes the primary guardian occupation through to createGuardian', async () => {
    vi.mocked(createGuardian).mockResolvedValue({ id: GUARDIAN_1 } as any)
    vi.mocked(createStudent).mockResolvedValue({ id: STUDENT_ID } as any)

    await saveStudentAction(null, makeFormData(createFields))

    expect(createGuardian).toHaveBeenCalledWith(
      expect.objectContaining({ occupation: 'Teacher' }),
    )
  })

  it('rejects a blank occupation for the primary guardian', async () => {
    const result = await saveStudentAction(
      null,
      makeFormData({ ...createFields, primary_occupation: '' }),
    )

    expect(result?.error).toBeDefined()
    expect(createGuardian).not.toHaveBeenCalled()
  })

  // Emergency contacts are not asked for an occupation.
  it('accepts an additional contact without an occupation', async () => {
    vi.mocked(createGuardian)
      .mockResolvedValueOnce({ id: GUARDIAN_1 } as any)
      .mockResolvedValueOnce({ id: CONTACT_1 } as any)
    vi.mocked(createStudent).mockResolvedValue({ id: STUDENT_ID } as any)

    const result = await saveStudentAction(
      null,
      makeFormData({
        ...createFields,
        has_contact1: 'true',
        contact1_first_name: 'Uncle',
        contact1_last_name: 'Bob',
        contact1_phone: '07700 900002',
        contact1_occupation: '',
      }),
    )

    expect(result).toBeUndefined()
    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({ additional_contact_1_id: CONTACT_1 }),
    )
  })

  it('creates secondary guardian when has_secondary is true', async () => {
    vi.mocked(createGuardian)
      .mockResolvedValueOnce({ id: GUARDIAN_1 } as any)
      .mockResolvedValueOnce({ id: GUARDIAN_2 } as any)
    vi.mocked(createStudent).mockResolvedValue({ id: STUDENT_ID } as any)

    await saveStudentAction(
      null,
      makeFormData({
        ...createFields,
        has_secondary: 'true',
        secondary_first_name: 'George',
        secondary_last_name: 'Smith',
        secondary_phone: '07700 900001',
        secondary_email: '',
        secondary_occupation: 'Chef',
        secondary_address_line_1: '',
        secondary_address_line_2: '',
        secondary_city: '',
        secondary_postcode: '',
      }),
    )

    expect(createGuardian).toHaveBeenCalledTimes(2)
    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({ secondary_guardian_id: GUARDIAN_2 }),
    )
  })

  it('creates additional contact 1 when has_contact1 is true', async () => {
    vi.mocked(createGuardian)
      .mockResolvedValueOnce({ id: GUARDIAN_1 } as any)
      .mockResolvedValueOnce({ id: CONTACT_1 } as any)
    vi.mocked(createStudent).mockResolvedValue({ id: STUDENT_ID } as any)

    await saveStudentAction(
      null,
      makeFormData({
        ...createFields,
        has_contact1: 'true',
        contact1_first_name: 'Uncle',
        contact1_last_name: 'Bob',
        contact1_phone: '07700 900002',
      }),
    )

    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({ additional_contact_1_id: CONTACT_1 }),
    )
  })

  it('saves the trimmed student code', async () => {
    vi.mocked(createGuardian).mockResolvedValue({ id: GUARDIAN_1 } as any)
    vi.mocked(createStudent).mockResolvedValue({ id: STUDENT_ID } as any)

    await saveStudentAction(null, makeFormData(createFields))

    expect(isStudentCodeTaken).toHaveBeenCalledWith('GK-1001', null)
    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({ student_code: 'GK-1001' }),
    )
  })

  it('requires a student code', async () => {
    const result = await saveStudentAction(
      null,
      makeFormData({ ...createFields, student_code: '  ' }),
    )

    expect(result).toEqual({
      error: 'Required',
      fieldErrors: { student_code: 'Required' },
    })
    expect(createGuardian).not.toHaveBeenCalled()
    expect(createStudent).not.toHaveBeenCalled()
  })

  it('refuses a code another student holds before writing anything', async () => {
    vi.mocked(isStudentCodeTaken).mockResolvedValue(true)

    const result = await saveStudentAction(null, makeFormData(createFields))

    const message = 'Student code "GK-1001" is already in use'
    expect(result).toEqual({
      error: message,
      fieldErrors: { student_code: message },
    })
    expect(createGuardian).not.toHaveBeenCalled()
    expect(createStudent).not.toHaveBeenCalled()
  })

  it('shows a code clash caught by the database', async () => {
    vi.mocked(createGuardian).mockResolvedValue({ id: GUARDIAN_1 } as any)
    vi.mocked(createStudent).mockRejectedValue({
      code: '23505',
      constraint_name: 'students_student_code_key',
    })

    const result = await saveStudentAction(null, makeFormData(createFields))

    const message = 'Student code "GK-1001" is already in use'
    expect(result).toEqual({
      error: message,
      fieldErrors: { student_code: message },
    })
  })

  it('returns an error object when creation fails', async () => {
    vi.mocked(createGuardian).mockRejectedValue(new Error('DB error'))

    const result = await saveStudentAction(null, makeFormData(createFields))

    expect(result).toEqual({
      error: 'Failed to save student. Please try again.',
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('converts empty strings to null for optional fields', async () => {
    vi.mocked(createGuardian).mockResolvedValue({ id: GUARDIAN_1 } as any)
    vi.mocked(createStudent).mockResolvedValue({ id: STUDENT_ID } as any)

    await saveStudentAction(null, makeFormData(createFields))

    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        allergies: null,
        notes: null,
      }),
    )
  })

  it('uses existing guardian id without calling createGuardian', async () => {
    vi.mocked(createStudent).mockResolvedValue({ id: STUDENT_ID } as any)

    await saveStudentAction(
      null,
      makeFormData({
        ...createFields,
        primary_mode: 'existing',
        primary_existing_id: GUARDIAN_EXISTING,
        primary_relationship: 'Father',
      }),
    )

    expect(createGuardian).not.toHaveBeenCalled()
    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({ primary_guardian_id: GUARDIAN_EXISTING }),
    )
  })

  it('sets address_guardian_id to primary guardian id when slot is primary', async () => {
    vi.mocked(createGuardian).mockResolvedValue({ id: GUARDIAN_1 } as any)
    vi.mocked(getGuardianById).mockResolvedValue({
      id: GUARDIAN_1,
      first_name: 'Maria',
      last_name: 'Smith',
      phone: '07700 900000',
      address_line_1: '99 Guardian Rd',
      city: 'Bristol',
      postcode: 'BS1 1AA',
    } as any)
    vi.mocked(createStudent).mockResolvedValue({ id: STUDENT_ID } as any)

    await saveStudentAction(null, makeFormData(createGuardianAddressFields))

    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        address_guardian_id: GUARDIAN_1,
        address_line_1: null,
        city: null,
        postcode: null,
      }),
    )
  })

  it('returns error when the existing guardian chosen has no address', async () => {
    vi.mocked(getGuardianById).mockResolvedValue({
      id: GUARDIAN_EXISTING,
      first_name: 'Maria',
      last_name: 'Smith',
      phone: '07700 900000',
      address_line_1: null,
      city: null,
      postcode: null,
    } as any)

    const result = await saveStudentAction(
      null,
      makeFormData({
        ...createGuardianAddressFields,
        primary_mode: 'existing',
        primary_existing_id: GUARDIAN_EXISTING,
      }),
    )

    expect(result).toEqual({
      error: expect.stringContaining('does not have an address'),
    })
    expect(createStudent).not.toHaveBeenCalled()
  })

  // The address rule is checked before any insert, so a rejection leaves no
  // orphaned guardian rows for a retry to duplicate.
  it('writes no guardian when a new primary guardian has no address to share', async () => {
    const result = await saveStudentAction(
      null,
      makeFormData({
        ...createGuardianAddressFields,
        primary_address_line_1: '',
        primary_city: '',
        primary_postcode: '',
      }),
    )

    expect(result).toEqual({
      error: expect.stringContaining('does not have an address'),
    })
    expect(createGuardian).not.toHaveBeenCalled()
    expect(getGuardianById).not.toHaveBeenCalled()
    expect(createStudent).not.toHaveBeenCalled()
  })

  it('writes no guardian when a later slot fails validation', async () => {
    const result = await saveStudentAction(
      null,
      makeFormData({
        ...createFields,
        has_contact1: 'true',
        contact1_first_name: 'Eleni',
        contact1_last_name: 'Georgiou',
        contact1_phone: 'not-a-phone',
        contact1_relationship: 'Aunt',
      }),
    )

    expect(result).toMatchObject({
      fieldErrors: { contact1_phone: expect.any(String) },
    })
    expect(createGuardian).not.toHaveBeenCalled()
    expect(createStudent).not.toHaveBeenCalled()
  })

  it('returns error when both address_guardian_id and own address are absent', async () => {
    const result = await saveStudentAction(
      null,
      makeFormData({
        ...createFields,
        address_guardian_id: '',
        student_address_line_1: '',
        student_city: '',
        student_postcode: '',
      }),
    )

    expect(result).toEqual({
      error: expect.stringContaining('Enter an address'),
    })
    expect(createStudent).not.toHaveBeenCalled()
  })

  it('passes own address fields when address_guardian_id is empty', async () => {
    vi.mocked(createGuardian).mockResolvedValue({ id: GUARDIAN_1 } as any)
    vi.mocked(createStudent).mockResolvedValue({ id: STUDENT_ID } as any)

    await saveStudentAction(null, makeFormData(createFields))

    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        address_guardian_id: null,
        address_line_1: '1 Main Street',
        city: 'London',
        postcode: 'EC1A 1BB',
      }),
    )
  })
})

// ─── saveStudentAction: update ──────────────────────────────────────────────

describe('saveStudentAction (update)', () => {
  it('returns error when not authenticated', async () => {
    vi.mocked(getActor).mockResolvedValue(null as any)

    const result = await saveStudentAction(
      STUDENT_ID,
      makeFormData(updateFields),
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

    const result = await saveStudentAction(
      STUDENT_ID,
      makeFormData(updateFields),
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
      saveStudentAction(STUDENT_ID, makeFormData(updateFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateStudent).toHaveBeenCalledWith(
      STUDENT_ID,
      expect.objectContaining({
        first_name: 'Anna',
        last_name: 'Smith',
        primary_guardian_id: GUARDIAN_1,
      }),
    )
    expect(redirect).toHaveBeenCalledWith('/students')
  })

  it('checks the code against every student but this one', async () => {
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      saveStudentAction(STUDENT_ID, makeFormData(updateFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(isStudentCodeTaken).toHaveBeenCalledWith('S001', STUDENT_ID)
    expect(updateStudent).toHaveBeenCalledWith(
      STUDENT_ID,
      expect.objectContaining({ student_code: 'S001' }),
    )
  })

  it('refuses a code another student holds', async () => {
    vi.mocked(isStudentCodeTaken).mockResolvedValue(true)

    const result = await saveStudentAction(
      STUDENT_ID,
      makeFormData(updateFields),
    )

    const message = 'Student code "S001" is already in use'
    expect(result).toEqual({
      error: message,
      fieldErrors: { student_code: message },
    })
    expect(updateStudent).not.toHaveBeenCalled()
  })

  it('forwards the submitted consent booleans to updateStudent', async () => {
    vi.mocked(updateStudent).mockResolvedValue(undefined)
    vi.mocked(updateStudentClasses).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    const fields = {
      ...updateFields,
      consent_privacy_notice: 'on',
      consent_emergency_first_aid: 'on',
    }

    await expect(
      saveStudentAction(STUDENT_ID, makeFormData(fields)),
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

    const fields = { ...updateFields, class_ids: [CLASS_1, CLASS_2] }

    await expect(
      saveStudentAction(STUDENT_ID, makeFormData(fields)),
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
      ...updateFields,
      primary_mode: 'new',
      primary_first_name: 'Jane',
      primary_last_name: 'Doe',
      primary_phone: '07700 900000',
      primary_email: 'jane@example.com',
      primary_occupation: 'Teacher',
    }

    await expect(
      saveStudentAction(STUDENT_ID, makeFormData(fields)),
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

    const result = await saveStudentAction(
      STUDENT_ID,
      makeFormData(updateFields),
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
      saveStudentAction(
        STUDENT_ID,
        makeFormData({
          ...updateFields,
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

    const result = await saveStudentAction(
      STUDENT_ID,
      makeFormData({
        ...updateFields,
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
    const result = await saveStudentAction(
      STUDENT_ID,
      makeFormData({
        ...updateFields,
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
      saveStudentAction(STUDENT_ID, makeFormData(updateFields)),
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

  it('marks the student as a leaver, logs and redirects', async () => {
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
