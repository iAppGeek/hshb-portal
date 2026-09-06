import { describe, it, expect } from 'vitest'

import {
  uuid,
  requiredString,
  optionalString,
  isoDate,
  isoDateTime,
  isoTime,
  ukPhone,
  optionalEmail,
  staffRole,
  incidentType,
  attendanceStatus,
  booleanFromString,
  checkbox,
  requiredCheckbox,
  submissionStatus,
  createClassSchema,
  updateClassSchema,
  updateGuardianSchema,
  createIncidentSchema,
  updateIncidentSchema,
  createLessonPlanSchema,
  updateLessonPlanSchema,
  staffAttendanceSchema,
  createStaffSchema,
  createStudentSchema,
  updateStudentSchema,
  guardianSchema,
  registrationContactSchema,
  registrationSubmissionSchema,
  approveRegistrationSchema,
  rejectRegistrationSchema,
  extractFormFields,
  extractGuardianFields,
  extractRegistrationContact,
} from './schemas'

// ─── Field schemas ───────────────────────────────────────────────────────────

describe('uuid', () => {
  it('accepts valid UUIDs', () => {
    expect(uuid.parse('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toBe(
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    )
  })

  it('rejects invalid UUIDs', () => {
    expect(() => uuid.parse('not-a-uuid')).toThrow()
    expect(() => uuid.parse('')).toThrow()
  })
})

describe('requiredString', () => {
  it('accepts non-empty strings', () => {
    expect(requiredString.parse('hello')).toBe('hello')
  })

  it('trims whitespace', () => {
    expect(requiredString.parse('  hello  ')).toBe('hello')
  })

  it('rejects empty and whitespace-only strings', () => {
    expect(() => requiredString.parse('')).toThrow()
    expect(() => requiredString.parse('   ')).toThrow()
  })
})

describe('optionalString', () => {
  it('returns trimmed string for non-empty values', () => {
    expect(optionalString.parse('  hello  ')).toBe('hello')
  })

  it('returns null for empty strings', () => {
    expect(optionalString.parse('')).toBeNull()
    expect(optionalString.parse('  ')).toBeNull()
  })

  it('accepts null', () => {
    expect(optionalString.parse(null)).toBeNull()
  })
})

describe('isoDate', () => {
  it('accepts YYYY-MM-DD format', () => {
    expect(isoDate.parse('2024-03-08')).toBe('2024-03-08')
  })

  it('rejects invalid formats', () => {
    expect(() => isoDate.parse('08/03/2024')).toThrow()
    expect(() => isoDate.parse('2024-3-8')).toThrow()
    expect(() => isoDate.parse('')).toThrow()
  })
})

describe('isoDateTime', () => {
  it('accepts datetime-local format', () => {
    expect(isoDateTime.parse('2024-03-08T10:30')).toBe('2024-03-08T10:30')
    expect(isoDateTime.parse('2024-03-08T10:30:00')).toBe('2024-03-08T10:30:00')
  })

  it('rejects invalid formats', () => {
    expect(() => isoDateTime.parse('2024-03-08')).toThrow()
    expect(() => isoDateTime.parse('')).toThrow()
  })
})

describe('isoTime', () => {
  it('accepts HH:MM format', () => {
    expect(isoTime.parse('09:30')).toBe('09:30')
  })

  it('rejects invalid formats', () => {
    expect(() => isoTime.parse('9:30')).toThrow()
    expect(() => isoTime.parse('09:30:00')).toThrow()
  })
})

describe('ukPhone', () => {
  it('accepts valid phone formats', () => {
    expect(ukPhone.parse('07700 900000')).toBe('07700 900000')
    expect(ukPhone.parse('+44 7700 900000')).toBe('+44 7700 900000')
    expect(ukPhone.parse('020-7946-0958')).toBe('020-7946-0958')
  })

  it('rejects invalid phone numbers', () => {
    expect(() => ukPhone.parse('abc')).toThrow()
    expect(() => ukPhone.parse('')).toThrow()
    expect(() => ukPhone.parse('123')).toThrow()
  })
})

describe('optionalEmail', () => {
  it('accepts valid emails', () => {
    expect(optionalEmail.parse('test@example.com')).toBe('test@example.com')
  })

  it('returns null for empty strings', () => {
    expect(optionalEmail.parse('')).toBeNull()
  })

  it('rejects invalid emails', () => {
    expect(() => optionalEmail.parse('not-an-email')).toThrow()
  })
})

describe('staffRole', () => {
  it('accepts valid roles', () => {
    expect(staffRole.parse('teacher')).toBe('teacher')
    expect(staffRole.parse('admin')).toBe('admin')
    expect(staffRole.parse('headteacher')).toBe('headteacher')
    expect(staffRole.parse('secretary')).toBe('secretary')
  })

  it('rejects unknown roles', () => {
    expect(() => staffRole.parse('student')).toThrow()
  })
})

describe('incidentType', () => {
  it('accepts valid types', () => {
    expect(incidentType.parse('medical')).toBe('medical')
    expect(incidentType.parse('behaviour')).toBe('behaviour')
    expect(incidentType.parse('other')).toBe('other')
  })

  it('rejects invalid types', () => {
    expect(() => incidentType.parse('unknown')).toThrow()
  })
})

describe('attendanceStatus', () => {
  it('accepts valid statuses', () => {
    expect(attendanceStatus.parse('present')).toBe('present')
    expect(attendanceStatus.parse('absent')).toBe('absent')
    expect(attendanceStatus.parse('late')).toBe('late')
  })

  it('rejects invalid statuses', () => {
    expect(() => attendanceStatus.parse('excused')).toThrow()
  })
})

describe('booleanFromString', () => {
  it('transforms "true" to true', () => {
    expect(booleanFromString.parse('true')).toBe(true)
  })

  it('transforms "false" to false', () => {
    expect(booleanFromString.parse('false')).toBe(false)
  })

  it('rejects non-boolean strings', () => {
    expect(() => booleanFromString.parse('yes')).toThrow()
  })
})

describe('checkbox', () => {
  it('treats "on" as checked', () => {
    expect(checkbox.parse('on')).toBe(true)
  })

  it('treats "true" as checked', () => {
    expect(checkbox.parse('true')).toBe(true)
  })

  it('treats undefined (unticked, absent from FormData) as unchecked', () => {
    expect(checkbox.parse(undefined)).toBe(false)
  })

  it('treats any other value as unchecked', () => {
    expect(checkbox.parse('off')).toBe(false)
  })
})

describe('requiredCheckbox', () => {
  it('accepts a ticked box', () => {
    expect(requiredCheckbox('Required').parse('on')).toBe(true)
  })

  it('rejects an unticked box', () => {
    expect(() => requiredCheckbox('Required').parse(undefined)).toThrow(
      'Required',
    )
  })
})

describe('submissionStatus', () => {
  it('accepts valid statuses', () => {
    expect(submissionStatus.parse('pending')).toBe('pending')
    expect(submissionStatus.parse('actioned')).toBe('actioned')
    expect(submissionStatus.parse('rejected')).toBe('rejected')
  })

  it('rejects unknown statuses', () => {
    expect(() => submissionStatus.parse('archived')).toThrow()
  })
})

// ─── Domain schemas ──────────────────────────────────────────────────────────

describe('createClassSchema', () => {
  const valid = {
    name: 'Year 3A',
    year_group: '3',
    room_number: 'R12',
    academic_year: '2024/25',
    teacher_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    student_ids: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
  }

  it('accepts valid class data', () => {
    const result = createClassSchema.parse(valid)
    expect(result.name).toBe('Year 3A')
  })

  it('allows optional fields as empty strings (null transform)', () => {
    const result = createClassSchema.parse({
      ...valid,
      room_number: '',
      academic_year: '',
    })
    expect(result.room_number).toBeNull()
    expect(result.academic_year).toBeNull()
  })

  it('rejects missing required fields', () => {
    expect(() => createClassSchema.parse({ ...valid, name: '' })).toThrow()
    expect(() =>
      createClassSchema.parse({ ...valid, teacher_id: 'bad' }),
    ).toThrow()
  })
})

describe('updateClassSchema', () => {
  it('requires the active field', () => {
    const result = updateClassSchema.parse({
      name: 'Year 1',
      year_group: '1',
      room_number: '',
      academic_year: '',
      teacher_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      student_ids: [],
      active: 'true',
    })
    expect(result.active).toBe(true)
  })
})

describe('updateGuardianSchema', () => {
  it('accepts valid guardian data', () => {
    const result = updateGuardianSchema.parse({
      first_name: 'Maria',
      last_name: 'Smith',
      phone: '07700 900000',
      email: 'maria@example.com',
      address_line_1: '123 High Street',
      address_line_2: '',
      city: 'London',
      postcode: 'N1 1AA',
      notes: '',
    })
    expect(result.first_name).toBe('Maria')
    expect(result.address_line_2).toBeNull()
    expect(result.notes).toBeNull()
  })

  it('rejects invalid phone', () => {
    expect(() =>
      updateGuardianSchema.parse({
        first_name: 'A',
        last_name: 'B',
        phone: 'abc',
        email: '',
        address_line_1: '',
        address_line_2: '',
        city: '',
        postcode: '',
        notes: '',
      }),
    ).toThrow()
  })
})

describe('createIncidentSchema', () => {
  const valid = {
    type: 'medical',
    student_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    title: 'Fell in playground',
    description: 'Scraped knee',
    incident_date: '2024-03-08T10:30',
    parent_notified: 'true',
    parent_notified_at: '2024-03-08T11:00',
  }

  it('accepts valid incident data', () => {
    const result = createIncidentSchema.parse(valid)
    expect(result.type).toBe('medical')
    expect(result.parent_notified).toBe(true)
  })

  it('rejects invalid incident type', () => {
    expect(() =>
      createIncidentSchema.parse({ ...valid, type: 'unknown' }),
    ).toThrow()
  })
})

describe('updateIncidentSchema', () => {
  it('does not require student_id', () => {
    const result = updateIncidentSchema.parse({
      type: 'behaviour',
      title: 'Disruption',
      description: 'Disrupted class',
      incident_date: '2024-03-08T10:30',
      parent_notified: 'false',
      parent_notified_at: '',
    })
    expect(result.type).toBe('behaviour')
  })
})

describe('createLessonPlanSchema', () => {
  it('accepts valid lesson plan data', () => {
    const result = createLessonPlanSchema.parse({
      class_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      lesson_date: '2024-03-08',
      description: 'Taught Greek alphabet',
    })
    expect(result.description).toBe('Taught Greek alphabet')
  })

  it('rejects description over 300 chars', () => {
    expect(() =>
      createLessonPlanSchema.parse({
        class_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        lesson_date: '2024-03-08',
        description: 'x'.repeat(301),
      }),
    ).toThrow()
  })
})

describe('updateLessonPlanSchema', () => {
  it('accepts valid data without class_id', () => {
    const result = updateLessonPlanSchema.parse({
      lesson_date: '2024-03-08',
      description: 'Updated lesson',
    })
    expect(result.lesson_date).toBe('2024-03-08')
  })
})

describe('staffAttendanceSchema', () => {
  it('accepts valid staff attendance data', () => {
    const result = staffAttendanceSchema.parse({
      staffId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      date: '2024-03-08',
      time: '09:30',
    })
    expect(result.staffId).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
  })

  it('rejects invalid time format', () => {
    expect(() =>
      staffAttendanceSchema.parse({
        staffId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        date: '2024-03-08',
        time: '9:30',
      }),
    ).toThrow()
  })
})

describe('createStaffSchema', () => {
  it('accepts valid staff data', () => {
    const result = createStaffSchema.parse({
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@school.com',
      role: 'teacher',
      display_name: '',
      contact_number: '',
      personal_email: '',
    })
    expect(result.display_name).toBeNull()
    expect(result.contact_number).toBeNull()
    expect(result.personal_email).toBeNull()
  })

  it('rejects invalid role', () => {
    expect(() =>
      createStaffSchema.parse({
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@school.com',
        role: 'principal',
        display_name: '',
        contact_number: '',
        personal_email: '',
      }),
    ).toThrow()
  })
})

describe('guardianSchema', () => {
  it('accepts existing guardian mode', () => {
    const result = guardianSchema.parse({
      mode: 'existing',
      existing_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    })
    expect(result.mode).toBe('existing')
  })

  it('accepts new guardian mode', () => {
    const result = guardianSchema.parse({
      mode: 'new',
      first_name: 'Maria',
      last_name: 'P',
      phone: '07700 900000',
    })
    expect(result.mode).toBe('new')
  })

  it('rejects new mode with missing required fields', () => {
    expect(() =>
      guardianSchema.parse({
        mode: 'new',
        first_name: '',
        last_name: 'P',
        phone: '07700 900000',
      }),
    ).toThrow()
  })

  it('rejects existing mode with invalid UUID', () => {
    expect(() =>
      guardianSchema.parse({
        mode: 'existing',
        existing_id: 'bad-id',
      }),
    ).toThrow()
  })
})

describe('createStudentSchema', () => {
  const validWithOwnAddress = {
    student_first_name: 'Anna',
    student_last_name: 'Smith',
    student_code: 'S001',
    student_date_of_birth: '2015-06-01',
    address_guardian_id: '',
    student_address_line_1: '123 High Street',
    student_address_line_2: '',
    student_city: 'London',
    student_postcode: 'N1 1AA',
    student_allergies: '',
    student_medical_details: '',
    student_notes: '',
    primary_relationship: 'Mother',
    has_secondary: 'false',
    has_contact1: 'false',
    has_contact2: 'false',
  }

  const validWithGuardianRef = {
    student_first_name: 'Anna',
    student_last_name: 'Smith',
    student_code: '',
    student_date_of_birth: '',
    address_guardian_id: 'primary',
    student_address_line_1: '',
    student_address_line_2: '',
    student_city: '',
    student_postcode: '',
    student_allergies: '',
    student_medical_details: '',
    student_notes: '',
    primary_relationship: 'Mother',
    has_secondary: 'false',
    has_contact1: 'false',
    has_contact2: 'false',
  }

  it('accepts student with own address', () => {
    const result = createStudentSchema.parse(validWithOwnAddress)
    expect(result.student_first_name).toBe('Anna')
    expect(result.address_guardian_id).toBeNull()
    expect(result.student_address_line_1).toBe('123 High Street')
  })

  it('accepts student with guardian address reference', () => {
    const result = createStudentSchema.parse(validWithGuardianRef)
    expect(result.address_guardian_id).toBe('primary')
    expect(result.student_address_line_1).toBeNull()
  })

  it('rejects when both address_guardian_id and own address are absent', () => {
    expect(() =>
      createStudentSchema.parse({
        ...validWithOwnAddress,
        address_guardian_id: '',
        student_address_line_1: '',
        student_city: '',
        student_postcode: '',
      }),
    ).toThrow('Enter an address or select a guardian')
  })

  it('rejects missing required name fields', () => {
    expect(() =>
      createStudentSchema.parse({
        ...validWithOwnAddress,
        student_first_name: '',
      }),
    ).toThrow()
  })
})

describe('updateStudentSchema', () => {
  it('requires class_ids array', () => {
    const result = updateStudentSchema.parse({
      student_first_name: 'Anna',
      student_last_name: 'Smith',
      student_code: '',
      student_date_of_birth: '',
      address_guardian_id: 'primary',
      student_address_line_1: '',
      student_address_line_2: '',
      student_city: '',
      student_postcode: '',
      student_allergies: '',
      student_medical_details: '',
      student_notes: '',
      primary_relationship: 'Mother',
      has_secondary: 'false',
      has_contact1: 'false',
      has_contact2: 'false',
      class_ids: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
    })
    expect(result.class_ids).toHaveLength(1)
  })
})

describe('registrationContactSchema', () => {
  const valid = {
    first_name: 'Petra',
    last_name: 'Pending',
    relationship: 'Mother',
    phone: '07700 900000',
    email: 'petra@example.com',
    same_as_child_address: 'on',
    address_line_1: '',
    address_line_2: '',
    city: '',
    postcode: '',
  }

  it('accepts valid contact data', () => {
    const result = registrationContactSchema.parse(valid)
    expect(result.first_name).toBe('Petra')
    expect(result.same_as_child_address).toBe(true)
  })

  it('accepts an empty email', () => {
    const result = registrationContactSchema.parse({ ...valid, email: '' })
    expect(result.email).toBeNull()
  })

  it('rejects a malformed email', () => {
    expect(() =>
      registrationContactSchema.parse({ ...valid, email: 'not-an-email' }),
    ).toThrow()
  })

  it('rejects missing required fields', () => {
    expect(() =>
      registrationContactSchema.parse({ ...valid, first_name: '' }),
    ).toThrow()
    expect(() =>
      registrationContactSchema.parse({ ...valid, last_name: '' }),
    ).toThrow()
    expect(() =>
      registrationContactSchema.parse({ ...valid, phone: '' }),
    ).toThrow()
  })
})

describe('registrationSubmissionSchema', () => {
  const valid = {
    child_first_name: 'Seed',
    child_last_name: 'Pending',
    date_of_birth: '2020-01-15',
    preferred_year_group: 'Year 1',
    address_line_1: '1 Seed St',
    address_line_2: '',
    city: 'London',
    postcode: 'N1 2AA',
    allergies: '',
    medical_details: '',
    collect_authorised: '',
    collect_password: '',
    has_secondary: 'false',
    has_contact1: 'false',
    has_contact2: 'false',
    consent_privacy_notice: 'on',
    consent_emergency_first_aid: 'on',
    consent_photo_media: 'on',
    consent_home_school: 'on',
    consent_comms_email_sms: 'on',
    declaration_name: 'Petra Pending',
    turnstile_token: 'token123',
  }

  it('accepts a valid submission', () => {
    const result = registrationSubmissionSchema.parse(valid)
    expect(result.child_first_name).toBe('Seed')
    expect(result.consent_privacy_notice).toBe(true)
  })

  it('rejects missing child, address or declaration fields', () => {
    expect(() =>
      registrationSubmissionSchema.parse({ ...valid, child_first_name: '' }),
    ).toThrow()
    expect(() =>
      registrationSubmissionSchema.parse({ ...valid, address_line_1: '' }),
    ).toThrow()
    expect(() =>
      registrationSubmissionSchema.parse({ ...valid, city: '' }),
    ).toThrow()
    expect(() =>
      registrationSubmissionSchema.parse({ ...valid, postcode: '' }),
    ).toThrow()
    expect(() =>
      registrationSubmissionSchema.parse({ ...valid, declaration_name: '' }),
    ).toThrow()
  })

  it('rejects when either required consent is unticked', () => {
    expect(() =>
      registrationSubmissionSchema.parse({
        ...valid,
        consent_privacy_notice: undefined,
      }),
    ).toThrow('privacy notice')
    expect(() =>
      registrationSubmissionSchema.parse({
        ...valid,
        consent_emergency_first_aid: undefined,
      }),
    ).toThrow('Emergency first aid')
  })

  it('allows optional consents to be unticked', () => {
    const result = registrationSubmissionSchema.parse({
      ...valid,
      consent_photo_media: undefined,
      consent_home_school: undefined,
      consent_comms_email_sms: undefined,
    })
    expect(result.consent_photo_media).toBe(false)
  })

  it('allows collection arrangement fields to be absent from the form', () => {
    const { collect_authorised: _a, collect_password: _p, ...rest } = valid
    const result = registrationSubmissionSchema.parse(rest)
    expect(result.collect_authorised).toBeUndefined()
  })
})

describe('approveRegistrationSchema', () => {
  it('turns empty strings into nulls', () => {
    const result = approveRegistrationSchema.parse({
      student_code: '',
      class_id: '',
      existing_student_id: '',
    })
    expect(result.student_code).toBeNull()
    expect(result.class_id).toBeNull()
    expect(result.existing_student_id).toBeNull()
  })

  it('accepts valid values', () => {
    const result = approveRegistrationSchema.parse({
      student_code: 'S001',
      class_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      existing_student_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    })
    expect(result.student_code).toBe('S001')
  })

  it('rejects an invalid uuid', () => {
    expect(() =>
      approveRegistrationSchema.parse({
        student_code: '',
        class_id: 'not-a-uuid',
        existing_student_id: '',
      }),
    ).toThrow()
  })
})

describe('rejectRegistrationSchema', () => {
  it('requires a reason', () => {
    expect(() => rejectRegistrationSchema.parse({ reason: '' })).toThrow()
    expect(rejectRegistrationSchema.parse({ reason: 'Duplicate' }).reason).toBe(
      'Duplicate',
    )
  })
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

describe('extractFormFields', () => {
  it('extracts single-value fields', () => {
    const fd = new FormData()
    fd.append('name', 'Test')
    fd.append('value', '123')

    const result = extractFormFields(fd)
    expect(result).toEqual({ name: 'Test', value: '123' })
  })

  it('collects array fields into arrays', () => {
    const fd = new FormData()
    fd.append('ids', 'a')
    fd.append('ids', 'b')
    fd.append('ids', 'c')

    const result = extractFormFields(fd, ['ids'])
    expect(result).toEqual({ ids: ['a', 'b', 'c'] })
  })

  it('handles mixed single and array fields', () => {
    const fd = new FormData()
    fd.append('name', 'Test')
    fd.append('tags', 'one')
    fd.append('tags', 'two')

    const result = extractFormFields(fd, ['tags'])
    expect(result).toEqual({ name: 'Test', tags: ['one', 'two'] })
  })
})

describe('extractGuardianFields', () => {
  it('extracts existing guardian fields', () => {
    const fd = new FormData()
    fd.append('primary_mode', 'existing')
    fd.append('primary_existing_id', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')

    const result = extractGuardianFields(fd, 'primary')
    expect(result).toEqual({
      mode: 'existing',
      existing_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    })
  })

  it('extracts new guardian fields', () => {
    const fd = new FormData()
    fd.append('primary_mode', 'new')
    fd.append('primary_first_name', 'Maria')
    fd.append('primary_last_name', 'P')
    fd.append('primary_phone', '07700 900000')
    fd.append('primary_email', 'maria@test.com')

    const result = extractGuardianFields(fd, 'primary')
    expect(result.mode).toBe('new')
    if (result.mode === 'new') {
      expect(result.first_name).toBe('Maria')
      expect(result.email).toBe('maria@test.com')
    }
  })
})

describe('extractRegistrationContact', () => {
  it('maps prefixed fields for a given prefix', () => {
    const fd = new FormData()
    fd.append('secondary_first_name', 'Gary')
    fd.append('secondary_last_name', 'Guardian')
    fd.append('secondary_relationship', 'Father')
    fd.append('secondary_phone', '07700 900001')
    fd.append('secondary_email', 'gary@example.com')
    fd.append('secondary_same_as_child_address', 'on')

    const result = extractRegistrationContact(fd, 'secondary')
    expect(result).toEqual({
      first_name: 'Gary',
      last_name: 'Guardian',
      relationship: 'Father',
      phone: '07700 900001',
      email: 'gary@example.com',
      same_as_child_address: 'on',
      address_line_1: '',
      address_line_2: '',
      city: '',
      postcode: '',
    })
  })

  it('defaults missing fields to empty strings', () => {
    const fd = new FormData()
    const result = extractRegistrationContact(fd, 'contact1')
    expect(result.first_name).toBe('')
    expect(result.same_as_child_address).toBeUndefined()
  })
})
