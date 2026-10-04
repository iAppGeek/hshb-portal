import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { redirect } from 'next/navigation'

import { getActor } from '@/auth/require'
import {
  getGuardianById,
  getNextStudentCode,
  getStudentById,
  isStudentCodeTaken,
  saveStudent,
  updateStudentClasses,
  markStudentAsLeaver,
  withdrawPhotoVideoConsent,
  logAuditEvent,
} from '@/db'

import {
  saveStudentAction,
  markStudentAsLeaverAction,
  withdrawPhotoVideoConsentAction,
} from './actions'

vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn(),
}))
vi.mock('@/db', () => ({
  getGuardianById: vi.fn(),
  getNextStudentCode: vi.fn(),
  getStudentById: vi.fn(),
  isStudentCodeTaken: vi.fn(),
  saveStudent: vi.fn(),
  updateStudentClasses: vi.fn(),
  markStudentAsLeaver: vi.fn(),
  withdrawPhotoVideoConsent: vi.fn(),
  logAuditEvent: vi.fn(),
}))

const GUARDIAN_1 = '00000000-0000-4000-8000-000000000001'
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
  vi.mocked(getNextStudentCode).mockResolvedValue('GK-1002')
  vi.mocked(saveStudent).mockResolvedValue({ id: STUDENT_ID })
})

/** The arguments of the one `saveStudent` call. */
function saved(): {
  id: string | null
  data: Parameters<typeof saveStudent>[1]
  slots: Parameters<typeof saveStudent>[2]
  addressFromPrimary: boolean
} {
  expect(saveStudent).toHaveBeenCalledTimes(1)
  const [id, data, slots, addressFromPrimary] =
    vi.mocked(saveStudent).mock.calls[0]
  return { id, data, slots, addressFromPrimary }
}

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
  student_sen_details: '',
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
  student_sen_details: '',
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
    expect(saveStudent).not.toHaveBeenCalled()
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
    expect(saveStudent).not.toHaveBeenCalled()
  })

  it('saves the student with a new primary guardian, then redirects', async () => {
    await saveStudentAction(null, makeFormData(createFields))

    const { id, data, slots } = saved()
    expect(id).toBeNull()
    expect(data).toMatchObject({
      first_name: 'Anna',
      last_name: 'Smith',
      primary_guardian_relationship: 'Mother',
    })
    expect(slots).toEqual({
      primary: {
        create: expect.objectContaining({
          first_name: 'Maria',
          last_name: 'Smith',
          phone: '07700 900000',
          email: 'maria@example.com',
        }),
      },
      secondary: null,
      contact1: null,
      contact2: null,
    })
    expect(redirect).toHaveBeenCalledWith('/students')
  })

  it('passes the English school name through to saveStudent', async () => {
    await saveStudentAction(null, makeFormData(createFields))

    expect(saved().data).toMatchObject({
      english_school_name: 'St Marys Primary',
    })
  })

  it('creates a student without an English school name', async () => {
    const result = await saveStudentAction(
      null,
      makeFormData({ ...createFields, student_english_school_name: '' }),
    )

    expect(result).toBeUndefined()
    expect(saved().data).toMatchObject({ english_school_name: null })
  })

  it('passes the primary guardian occupation through to the new guardian', async () => {
    await saveStudentAction(null, makeFormData(createFields))

    expect(saved().slots.primary).toEqual({
      create: expect.objectContaining({ occupation: 'Teacher' }),
    })
  })

  it('rejects a blank occupation for the primary guardian', async () => {
    const result = await saveStudentAction(
      null,
      makeFormData({ ...createFields, primary_occupation: '' }),
    )

    expect(result?.error).toBeDefined()
    expect(saveStudent).not.toHaveBeenCalled()
  })

  // Emergency contacts are not asked for an occupation.
  it('accepts an additional contact without an occupation', async () => {
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
    expect(saved().slots.contact1).toEqual({
      create: expect.objectContaining({
        first_name: 'Uncle',
        occupation: undefined,
      }),
    })
  })

  it('creates secondary guardian when has_secondary is true', async () => {
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

    expect(saved().slots.secondary).toEqual({
      create: expect.objectContaining({
        first_name: 'George',
        occupation: 'Chef',
      }),
    })
  })

  it('creates additional contact 1 when has_contact1 is true', async () => {
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

    expect(saved().slots.contact1).toEqual({
      create: expect.objectContaining({
        first_name: 'Uncle',
        last_name: 'Bob',
      }),
    })
  })

  it('saves the trimmed student code', async () => {
    await saveStudentAction(null, makeFormData(createFields))

    expect(isStudentCodeTaken).toHaveBeenCalledWith('GK-1001', null)
    expect(saved().data).toMatchObject({ student_code: 'GK-1001' })
  })

  it('saves the student code in upper case', async () => {
    await saveStudentAction(
      null,
      makeFormData({ ...createFields, student_code: 'gk-1001' }),
    )

    expect(isStudentCodeTaken).toHaveBeenCalledWith('GK-1001', null)
    expect(saved().data).toMatchObject({ student_code: 'GK-1001' })
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
    expect(saveStudent).not.toHaveBeenCalled()
  })

  it('refuses a code another student holds before writing anything', async () => {
    vi.mocked(isStudentCodeTaken).mockResolvedValue(true)

    const result = await saveStudentAction(null, makeFormData(createFields))

    const message =
      'Student code "GK-1001" is already in use. The next free code is GK-1002.'
    expect(result).toEqual({
      error: message,
      fieldErrors: { student_code: message },
    })
    expect(saveStudent).not.toHaveBeenCalled()
  })

  it('shows a code clash caught by the database', async () => {
    vi.mocked(saveStudent).mockRejectedValue({
      code: '23505',
      constraint_name: 'students_student_code_key',
    })

    const result = await saveStudentAction(null, makeFormData(createFields))

    const message =
      'Student code "GK-1001" is already in use. The next free code is GK-1002.'
    expect(result).toEqual({
      error: message,
      fieldErrors: { student_code: message },
    })
  })

  it('returns an error object when creation fails', async () => {
    vi.mocked(saveStudent).mockRejectedValue(new Error('DB error'))

    const result = await saveStudentAction(null, makeFormData(createFields))

    expect(result).toEqual({
      error: 'Failed to save student. Please try again.',
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('converts empty strings to null for optional fields', async () => {
    await saveStudentAction(null, makeFormData(createFields))

    expect(saved().data).toMatchObject({ allergies: null, notes: null })
  })

  it('links an existing guardian by id', async () => {
    await saveStudentAction(
      null,
      makeFormData({
        ...createFields,
        primary_mode: 'existing',
        primary_existing_id: GUARDIAN_EXISTING,
        primary_relationship: 'Father',
      }),
    )

    expect(saved().slots.primary).toEqual({ id: GUARDIAN_EXISTING })
  })

  it('shares the new primary guardian address when the slot is primary', async () => {
    vi.mocked(getGuardianById).mockResolvedValue({
      id: GUARDIAN_1,
      first_name: 'Maria',
      last_name: 'Smith',
      phone: '07700 900000',
      address_line_1: '99 Guardian Rd',
      city: 'Bristol',
      postcode: 'BS1 1AA',
    } as any)

    await saveStudentAction(null, makeFormData(createGuardianAddressFields))

    const { data, addressFromPrimary } = saved()
    expect(addressFromPrimary).toBe(true)
    expect(data).toMatchObject({
      address_line_1: null,
      city: null,
      postcode: null,
    })
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
    expect(saveStudent).not.toHaveBeenCalled()
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
    expect(getGuardianById).not.toHaveBeenCalled()
    expect(saveStudent).not.toHaveBeenCalled()
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
    expect(saveStudent).not.toHaveBeenCalled()
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
    expect(saveStudent).not.toHaveBeenCalled()
  })

  it('passes own address fields when address_guardian_id is empty', async () => {
    await saveStudentAction(null, makeFormData(createFields))

    const { data, addressFromPrimary } = saved()
    expect(addressFromPrimary).toBe(false)
    expect(data).toMatchObject({
      address_line_1: '1 Main Street',
      city: 'London',
      postcode: 'EC1A 1BB',
    })
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
    expect(saveStudent).not.toHaveBeenCalled()
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
    expect(saveStudent).not.toHaveBeenCalled()
  })

  it('updates student and redirects on success', async () => {
    vi.mocked(updateStudentClasses).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      saveStudentAction(STUDENT_ID, makeFormData(updateFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    const { id, data, slots } = saved()
    expect(id).toBe(STUDENT_ID)
    expect(data).toMatchObject({ first_name: 'Anna', last_name: 'Smith' })
    expect(slots.primary).toEqual({ id: GUARDIAN_1 })
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
    expect(saved().data).toMatchObject({ student_code: 'S001' })
  })

  it('refuses a code another student holds', async () => {
    vi.mocked(isStudentCodeTaken).mockResolvedValue(true)

    const result = await saveStudentAction(
      STUDENT_ID,
      makeFormData(updateFields),
    )

    const message =
      'Student code "S001" is already in use. The next free code is GK-1002.'
    expect(result).toEqual({
      error: message,
      fieldErrors: { student_code: message },
    })
    expect(saveStudent).not.toHaveBeenCalled()
  })

  it('forwards the submitted consent booleans to saveStudent', async () => {
    vi.mocked(updateStudentClasses).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    const fields = {
      ...updateFields,
      privacy_notice_read: 'on',
      first_aid_consent: 'on',
    }

    await expect(
      saveStudentAction(STUDENT_ID, makeFormData(fields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(saved().data).toMatchObject({
      privacy_notice_read: true,
      first_aid_consent: true,
      home_school_agreement: false,
      email_sms_contact_ack: false,
    })
  })

  describe('photo/video consent', () => {
    beforeEach(() => {
      vi.mocked(updateStudentClasses).mockResolvedValue(undefined)
      vi.mocked(redirect).mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
      })
    })

    it.each([
      ['unticked', 'on', '', false],
      ['ticked', '', 'on', true],
    ])(
      'saves the box when the admin %s it',
      async (_change, initial, box, expected) => {
        await expect(
          saveStudentAction(
            STUDENT_ID,
            makeFormData({
              ...updateFields,
              photo_video_consent_initial: initial,
              ...(box ? { photo_video_consent: box } : {}),
            }),
          ),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(saved().data.photo_video_consent).toBe(expected)
      },
    )

    it.each([
      ['ticked', 'on'],
      ['unticked', ''],
    ])(
      'leaves consent as it is when the box is still %s as loaded',
      async (_state, value) => {
        await expect(
          saveStudentAction(
            STUDENT_ID,
            makeFormData({
              ...updateFields,
              photo_video_consent_initial: value,
              ...(value ? { photo_video_consent: value } : {}),
            }),
          ),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(saved().data.photo_video_consent).toBeUndefined()
      },
    )
  })

  it('passes the admin to saveStudent so a consent change records them', async () => {
    vi.mocked(updateStudentClasses).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      saveStudentAction(STUDENT_ID, makeFormData(updateFields)),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(vi.mocked(saveStudent).mock.calls[0][4]).toBe('admin-1')
  })

  describe('may leave on their own', () => {
    // 4 Oct 2026: a child born on 4 Oct 2014 turns 12 that day.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-04T09:30:00Z'))
      vi.mocked(updateStudentClasses).mockResolvedValue(undefined)
      vi.mocked(redirect).mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
      })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    async function saveWith(fields: Record<string, string>): Promise<void> {
      await expect(
        saveStudentAction(
          STUDENT_ID,
          makeFormData({ ...updateFields, ...fields }),
        ),
      ).rejects.toThrow('NEXT_REDIRECT')
    }

    it('saves a tick for a student aged 12 or over', async () => {
      await saveWith({
        student_date_of_birth: '2014-10-04',
        may_leave_unaccompanied: 'on',
      })

      expect(saved().data.may_leave_unaccompanied).toBe(true)
    })

    it('saves an unticked box as not given', async () => {
      await saveWith({ student_date_of_birth: '2010-01-01' })

      expect(saved().data.may_leave_unaccompanied).toBe(false)
    })

    it.each([
      ['under 12', '2014-10-05'],
      ['with no date of birth', ''],
    ])(
      'saves not given for a student %s even if a tick is sent',
      async (_case, dob) => {
        await saveWith({
          student_date_of_birth: dob,
          may_leave_unaccompanied: 'on',
        })

        expect(saved().data.may_leave_unaccompanied).toBe(false)
      },
    )
  })

  it('saves the SEN details', async () => {
    vi.mocked(updateStudentClasses).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      saveStudentAction(
        STUDENT_ID,
        makeFormData({ ...updateFields, student_sen_details: 'Dyslexia' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(saved().data).toMatchObject({ sen_details: 'Dyslexia' })
  })

  it('updates class enrollments with submitted class ids', async () => {
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

    expect(saved().slots.primary).toEqual({
      create: expect.objectContaining({
        first_name: 'Jane',
        last_name: 'Doe',
        occupation: 'Teacher',
      }),
    })
  })

  it('returns error when update throws', async () => {
    vi.mocked(saveStudent).mockRejectedValue(new Error('DB error'))
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

  it('shares the primary guardian address when the slot is primary', async () => {
    vi.mocked(getGuardianById).mockResolvedValue({
      id: GUARDIAN_1,
      first_name: 'Maria',
      last_name: 'Smith',
      phone: '07700 900000',
      address_line_1: '1 Main Street',
      city: 'London',
      postcode: 'EC1A 1BB',
    } as any)
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

    const { data, addressFromPrimary } = saved()
    expect(addressFromPrimary).toBe(true)
    expect(data).toMatchObject({
      address_line_1: null,
      city: null,
      postcode: null,
    })
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
    expect(saveStudent).not.toHaveBeenCalled()
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
    expect(saveStudent).not.toHaveBeenCalled()
  })

  it('does not touch class enrolments for an inactive student', async () => {
    vi.mocked(getStudentById).mockResolvedValue({ active: false } as any)
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

describe('withdrawPhotoVideoConsentAction', () => {
  it('withdraws consent as the signed-in admin, logs and reloads the student', async () => {
    vi.mocked(withdrawPhotoVideoConsent).mockResolvedValue(undefined)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(withdrawPhotoVideoConsentAction(STUDENT_ID)).rejects.toThrow(
      'NEXT_REDIRECT',
    )

    expect(withdrawPhotoVideoConsent).toHaveBeenCalledWith(
      STUDENT_ID,
      'admin-1',
    )
    expect(logAuditEvent).toHaveBeenCalledWith({
      staffId: 'admin-1',
      action: 'update',
      entity: 'student',
      entityId: STUDENT_ID,
      details: { photo_video_consent: false },
    })
    expect(redirect).toHaveBeenCalledWith(`/students/${STUDENT_ID}`)
  })

  it('refuses staff who cannot edit students', async () => {
    vi.mocked(getActor).mockResolvedValue({
      ...adminSession,
      role: 'teacher',
    } as Awaited<ReturnType<typeof getActor>>)

    const result = await withdrawPhotoVideoConsentAction(STUDENT_ID)

    expect(result).toEqual({ error: 'Not authorised' })
    expect(withdrawPhotoVideoConsent).not.toHaveBeenCalled()
  })
})
