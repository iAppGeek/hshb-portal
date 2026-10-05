import { and, count, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { todayInSchoolTz } from '@/lib/datetime'
import { asDbError, DbError } from '@/lib/db-error'

import { db } from './client'
import {
  approveRegistration,
  createRegistrationSubmission,
  deleteRegistrationSubmission,
  getPendingRegistrationCount,
  getRegistrationSubmissionById,
  getRegistrationSubmissions,
  rejectRegistration,
  type RegistrationSubmissionInsert,
} from './registrations'
import {
  classes,
  guardians,
  registrationSubmissionContacts,
  registrationSubmissions,
  studentClasses,
  students,
} from './schema'
import { getStudentById } from './students'
import { failWritesTo, resetDatabase, SEED } from './test-db'

afterAll(resetDatabase)

const V1_CONSENTS = {
  privacy_notice_read: true,
  first_aid_consent: true,
  email_sms_contact_ack: true,
  photo_video_consent: false,
  home_school_agreement: true,
  may_leave_unaccompanied: true,
  sen_details: 'Dyslexia',
  consents_recorded_at: '2026-10-04T09:30:00.000Z',
  privacy_notice_version: '1.0',
} satisfies Partial<RegistrationSubmissionInsert>

async function submit(
  childFirstName: string,
  consents: Partial<RegistrationSubmissionInsert> = {},
): Promise<string> {
  const { id } = await createRegistrationSubmission({
    submission: {
      ...consents,
      child_first_name: childFirstName,
      child_last_name: 'Applicant',
      date_of_birth: '2019-05-05',
      address_line_1: '4 New Rd',
      city: 'London',
      postcode: 'N4 4AA',
      declaration_name: 'Pat Parent',
      privacy_notice_read: true,
    },
    contacts: [
      {
        contact_role: 'primary',
        first_name: 'Pat',
        last_name: 'Parent',
        phone: '07900000001',
        email: 'pat@example.com',
      },
      {
        contact_role: 'secondary',
        first_name: 'Sam',
        last_name: 'Parent',
        phone: '07900000002',
      },
    ],
  })
  return id
}

describe('registration reads', () => {
  it('lists submissions newest first with the primary contact', async () => {
    const all = await getRegistrationSubmissions('all')
    expect(all.map((s) => s.id)).toEqual(
      expect.arrayContaining(Object.values(SEED.registrations)),
    )
    const pending = await getRegistrationSubmissions('pending')
    expect(pending).toEqual([
      expect.objectContaining({
        id: SEED.registrations.pending,
        status: 'pending',
        primary_contact: {
          first_name: 'Petra',
          last_name: 'Pending',
          phone: '07722000001',
          email: 'petra.pending@example.com',
        },
      }),
    ])
    expect(await getPendingRegistrationCount()).toBe(1)
  })

  it('returns a submission with every contact, or null', async () => {
    const id = await submit('Mia')
    const full = await getRegistrationSubmissionById(id)
    expect(full?.child_first_name).toBe('Mia')
    expect(full?.contacts.map((c) => c.contact_role).sort()).toEqual([
      'primary',
      'secondary',
    ])
    expect(
      await getRegistrationSubmissionById(
        '80000000-0000-0000-0000-0000000000ff',
      ),
    ).toBeNull()
    expect(await getRegistrationSubmissionById('not-a-uuid')).toBeNull()
  })
})

describe('registration review', () => {
  it('rejects a pending submission once', async () => {
    const id = await submit('Rex')
    await rejectRegistration({
      submissionId: id,
      staffId: SEED.staff.admin,
      reason: 'Full',
    })
    expect(await getRegistrationSubmissionById(id)).toMatchObject({
      status: 'rejected',
      rejected_reason: 'Full',
      actioned_by: SEED.staff.admin,
      actioned_at: expect.any(String),
    })
    await expect(
      rejectRegistration({
        submissionId: id,
        staffId: SEED.staff.admin,
        reason: 'x',
      }),
    ).rejects.toThrow('Submission not found or already actioned')
  })

  it('deletes a submission, and fails for a missing one', async () => {
    const id = await submit('Del')
    await deleteRegistrationSubmission(id)
    expect(await getRegistrationSubmissionById(id)).toBeNull()
    await expect(deleteRegistrationSubmission(id)).rejects.toThrow(
      'Submission not found',
    )
  })
})

describe('registration consents', () => {
  it('stores each consent separately with the time recorded and the notice version', async () => {
    const id = await submit('Cleo', V1_CONSENTS)

    expect(await getRegistrationSubmissionById(id)).toMatchObject({
      privacy_notice_read: true,
      first_aid_consent: true,
      email_sms_contact_ack: true,
      photo_video_consent: false,
      home_school_agreement: true,
      may_leave_unaccompanied: true,
      sen_details: 'Dyslexia',
      consents_recorded_at: '2026-10-04T09:30:00+00:00',
      privacy_notice_version: '1.0',
    })
  })

  it('leaves the time and version unknown on submissions from before v1.0', async () => {
    expect(
      await getRegistrationSubmissionById(SEED.registrations.pending),
    ).toMatchObject({
      privacy_notice_read: true,
      first_aid_consent: true,
      may_leave_unaccompanied: false,
      consents_recorded_at: null,
      privacy_notice_version: null,
    })
  })

  it('stores a missing leave-alone answer as not given', async () => {
    const { may_leave_unaccompanied: _omitted, ...rest } = V1_CONSENTS
    const id = await submit('Iris', rest)

    expect(await getRegistrationSubmissionById(id)).toMatchObject({
      may_leave_unaccompanied: false,
    })
  })

  it('copies the consents, SEN details and notice version onto a new student', async () => {
    const id = await submit('Dora', V1_CONSENTS)
    const { student_id } = await approveRegistration({
      submissionId: id,
      staffId: SEED.staff.admin,
      studentCode: 'DORA-1',
      classId: null,
      existingStudentId: null,
      reuseGuardians: true,
    })

    expect(await getStudentById(student_id)).toMatchObject({
      privacy_notice_read: true,
      first_aid_consent: true,
      email_sms_contact_ack: true,
      photo_video_consent: false,
      home_school_agreement: true,
      may_leave_unaccompanied: true,
      sen_details: 'Dyslexia',
      consents_recorded_at: '2026-10-04T09:30:00+00:00',
      privacy_notice_version: '1.0',
      photo_video_consent_withdrawn_at: null,
    })
  })

  describe('a returning child’s photo/video consent', () => {
    /** Carol with consent withdrawn by the admin at `at`. */
    async function withdrawnAt(at: string): Promise<void> {
      await db
        .update(students)
        .set({
          photoVideoConsent: false,
          photoVideoConsentWithdrawnAt: at,
          photoVideoConsentWithdrawnBy: SEED.staff.admin,
        })
        .where(eq(students.id, SEED.students.carol))
    }

    async function approveOntoCarol(
      consents: Partial<RegistrationSubmissionInsert>,
    ): Promise<void> {
      const id = await submit('Carol', consents)
      await approveRegistration({
        submissionId: id,
        staffId: SEED.staff.admin,
        studentCode: null,
        classId: null,
        existingStudentId: SEED.students.carol,
        reuseGuardians: true,
      })
    }

    it('is given again, clearing the withdrawal, by a form filled in after it', async () => {
      await withdrawnAt('2026-09-01T10:00:00Z')

      await approveOntoCarol({ ...V1_CONSENTS, photo_video_consent: true })

      expect(await getStudentById(SEED.students.carol)).toMatchObject({
        photo_video_consent: true,
        photo_video_consent_withdrawn_at: null,
        photo_video_consent_withdrawn_by: null,
        privacy_notice_version: '1.0',
        may_leave_unaccompanied: true,
      })
    })

    it('stays withdrawn when the form was filled in before the withdrawal', async () => {
      // The form below was filled in on 4 Oct 2026 at 09:30 UTC.
      await withdrawnAt('2026-10-04T15:00:00Z')

      await approveOntoCarol({ ...V1_CONSENTS, photo_video_consent: true })

      expect(await getStudentById(SEED.students.carol)).toMatchObject({
        photo_video_consent: false,
        photo_video_consent_withdrawn_at: '2026-10-04T15:00:00+00:00',
        photo_video_consent_withdrawn_by: SEED.staff.admin,
      })
    })

    it('uses the submission time for a form from before v1.0', async () => {
      await withdrawnAt('2000-01-01T00:00:00Z')

      await approveOntoCarol({ photo_video_consent: true })

      expect(await getStudentById(SEED.students.carol)).toMatchObject({
        photo_video_consent: true,
        photo_video_consent_withdrawn_at: null,
      })
    })

    it('keeps the withdrawal on record when the new form does not give consent', async () => {
      await withdrawnAt('2026-09-01T10:00:00Z')

      await approveOntoCarol({ ...V1_CONSENTS, photo_video_consent: false })

      expect(await getStudentById(SEED.students.carol)).toMatchObject({
        photo_video_consent: false,
        photo_video_consent_withdrawn_at: '2026-09-01T10:00:00+00:00',
      })
    })
  })
})

async function rowCount(
  table:
    | typeof guardians
    | typeof students
    | typeof registrationSubmissions
    | typeof registrationSubmissionContacts,
): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(table)
  return n
}

describe('createRegistrationSubmission', () => {
  it('stores the submission and its contacts with their defaults', async () => {
    const id = await submit('Def')
    expect(await getRegistrationSubmissionById(id)).toMatchObject({
      status: 'pending',
      photo_video_consent: false,
      privacy_notice_read: true,
      contacts: expect.arrayContaining([
        expect.objectContaining({
          contact_role: 'primary',
          same_as_child_address: true,
        }),
      ]),
    })
  })

  it('requires a primary contact, saving nothing without one', async () => {
    const before = await rowCount(registrationSubmissions)
    await expect(
      createRegistrationSubmission({
        submission: {
          child_first_name: 'No',
          child_last_name: 'Primary',
          date_of_birth: '2019-05-05',
          address_line_1: '4 New Rd',
          city: 'London',
          postcode: 'N4 4AA',
          declaration_name: 'Sam Parent',
        },
        contacts: [
          {
            contact_role: 'secondary',
            first_name: 'Sam',
            last_name: 'Parent',
            phone: '07900000002',
          },
        ],
      }),
    ).rejects.toEqual(new DbError('A primary parent/carer is required'))
    expect(await rowCount(registrationSubmissions)).toBe(before)
  })

  it('leaves nothing behind when a write fails part-way', async () => {
    const before = await rowCount(registrationSubmissions)
    const err = await failWritesTo(
      'registration_submission_contacts',
      "contact_role <> 'secondary'",
      () => submit('Half'),
    )
    expect(err).toBeDefined()
    expect(await rowCount(registrationSubmissions)).toBe(before)
  })
})

describe('approveRegistration', () => {
  beforeEach(resetDatabase)

  const approve = (
    submissionId: string,
    options: Partial<{
      studentCode: string | null
      classId: string | null
      existingStudentId: string | null
      reuseGuardians: boolean
      staffId: string
    }> = {},
  ): ReturnType<typeof approveRegistration> =>
    approveRegistration({
      submissionId,
      staffId: SEED.staff.admin,
      studentCode: null,
      classId: null,
      existingStudentId: null,
      reuseGuardians: true,
      ...options,
    })

  /** A submission whose primary contact is the seeded guardian `contact`. */
  async function submitFor(
    contact: {
      last_name: string
      phone: string
      email?: string | null
    },
    childFirstName = 'Ava',
  ): Promise<string> {
    const { id } = await createRegistrationSubmission({
      submission: {
        child_first_name: childFirstName,
        child_last_name: 'Applicant',
        date_of_birth: '2019-05-05',
        address_line_1: '4 New Rd',
        city: 'London',
        postcode: 'N4 4AA',
        declaration_name: 'Pat Parent',
        privacy_notice_read: true,
      },
      contacts: [
        {
          contact_role: 'primary',
          first_name: 'Pat',
          relationship: 'Mother',
          occupation: 'Nurse',
          ...contact,
        },
        {
          contact_role: 'secondary',
          first_name: 'Sam',
          last_name: 'Parent',
          phone: '07900000002',
          relationship: 'Father',
        },
      ],
    })
    return id
  }

  async function guardian(id: string): Promise<{
    phone: string
    occupation: string | null
    city: string | null
  }> {
    const [row] = await db
      .select({
        phone: guardians.phone,
        occupation: guardians.occupation,
        city: guardians.city,
      })
      .from(guardians)
      .where(eq(guardians.id, id))
    return row
  }

  it('creates a student, reusing a guardian matched by email and refreshing them', async () => {
    const id = await submitFor({
      last_name: 'AliceGuardian',
      phone: '07900000001',
      email: 'GARY.ALICE@example.com',
    })

    const result = await approve(id, {
      studentCode: 'AVA-1',
      classId: SEED.classes.gamma,
    })

    expect(result).toEqual({
      student_id: expect.any(String),
      linked_existing: false,
      guardians: [
        {
          contact_role: 'primary',
          guardian_id: SEED.guardians.gary,
          reused: true,
          matched_on: 'email',
          changes: {
            phone: { old: '07711000001', new: '07900000001' },
            email: {
              old: 'gary.alice@example.com',
              new: 'GARY.ALICE@example.com',
            },
            occupation: { old: 'Bus driver', new: 'Nurse' },
            address_line_1: { old: null, new: '4 New Rd' },
            city: { old: null, new: 'London' },
            postcode: { old: null, new: 'N4 4AA' },
          },
        },
        {
          contact_role: 'secondary',
          guardian_id: expect.any(String),
          reused: false,
          matched_on: null,
          changes: {},
        },
      ],
      student_changes: {},
    })
    expect(await guardian(SEED.guardians.gary)).toEqual({
      phone: '07900000001',
      occupation: 'Nurse',
      city: 'London',
    })

    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.id, result.student_id))
    expect(student).toMatchObject({
      studentCode: 'AVA-1',
      firstName: 'Ava',
      primaryGuardianId: SEED.guardians.gary,
      primaryGuardianRelationship: 'Mother',
      secondaryGuardianId: result.guardians[1].guardian_id,
      secondaryGuardianRelationship: 'Father',
      addressLine1: '4 New Rd',
      privacyNoticeRead: true,
      active: true,
    })
    const stays = await db
      .select({
        classId: studentClasses.classId,
        startDate: studentClasses.startDate,
      })
      .from(studentClasses)
      .where(eq(studentClasses.studentId, result.student_id))
    expect(stays).toEqual([
      { classId: SEED.classes.gamma, startDate: todayInSchoolTz() },
    ])
    expect(await getRegistrationSubmissionById(id)).toMatchObject({
      status: 'actioned',
      actioned_by: SEED.staff.admin,
      student_id: result.student_id,
      linked_existing: false,
    })
  })

  it('matches by phone digits and last name when there is no email', async () => {
    const id = await submitFor({
      last_name: 'bobguardian',
      phone: '07711 000 002',
      email: null,
    })
    const result = await approve(id)
    expect(result.guardians[0]).toMatchObject({
      guardian_id: SEED.guardians.grace,
      reused: true,
      matched_on: 'phone',
    })
  })

  it('creates new guardians when told not to reuse', async () => {
    const before = await rowCount(guardians)
    const id = await submitFor({
      last_name: 'AliceGuardian',
      phone: '07711000001',
      email: 'gary.alice@example.com',
    })
    const result = await approve(id, { reuseGuardians: false })
    expect(result.guardians.map((g) => g.reused)).toEqual([false, false])
    expect(await rowCount(guardians)).toBe(before + 2)
    expect(await guardian(SEED.guardians.gary)).toMatchObject({
      phone: '07711000001',
    })
  })

  it('links a returning child: the submission replaces their details and reactivates them', async () => {
    await db
      .update(students)
      .set({ active: false, leavingReason: 'left', studentCode: 'CAR-1' })
      .where(eq(students.id, SEED.students.carol))
    const id = await submitFor(
      { last_name: 'CarolGuardian', phone: '07711000003', email: null },
      'Caroline',
    )

    const result = await approve(id, {
      existingStudentId: SEED.students.carol,
    })

    expect(result.student_id).toBe(SEED.students.carol)
    expect(result.linked_existing).toBe(true)
    expect(result.student_changes).toEqual({
      first_name: { old: 'Carol', new: 'Caroline' },
      last_name: { old: 'Student', new: 'Applicant' },
      date_of_birth: { old: null, new: '2019-05-05' },
      address_line_1: { old: '3 Test St', new: '4 New Rd' },
      postcode: { old: 'N1 1AC', new: 'N4 4AA' },
      secondary_guardian_id: {
        old: null,
        new: result.guardians[1].guardian_id,
      },
      privacy_notice_read: { old: 'false', new: 'true' },
      active: { old: 'false', new: 'true' },
    })
    const [carol] = await db
      .select({
        studentCode: students.studentCode,
        leavingReason: students.leavingReason,
      })
      .from(students)
      .where(eq(students.id, SEED.students.carol))
    expect(carol).toEqual({ studentCode: 'CAR-1', leavingReason: null })
    expect(await getRegistrationSubmissionById(id)).toMatchObject({
      linked_existing: true,
    })
  })

  it('rejects a missing or already actioned submission', async () => {
    await expect(approve(SEED.registrations.rejected)).rejects.toEqual(
      new DbError('Submission not found or already actioned'),
    )
    const id = await submitFor({ last_name: 'Once', phone: '07900000009' })
    await approve(id)
    await expect(approve(id)).rejects.toEqual(
      new DbError('Submission not found or already actioned'),
    )
  })

  it('rejects a class that is not open', async () => {
    const [prior] = await db
      .insert(classes)
      .values({
        name: 'Old',
        yearGroup: 'Year 1',
        academicYearId: SEED.years.prior,
      })
      .returning({ id: classes.id })
    await expect(
      approve(SEED.registrations.pending, { classId: prior.id }),
    ).rejects.toEqual(
      new DbError(
        'Students can only be enrolled in active classes of the current year.',
      ),
    )
  })

  it('rejects a submission without a primary contact', async () => {
    await db
      .delete(registrationSubmissionContacts)
      .where(
        eq(
          registrationSubmissionContacts.submissionId,
          SEED.registrations.pending,
        ),
      )
    await expect(approve(SEED.registrations.pending)).rejects.toEqual(
      new DbError(
        'Submission has no primary parent/carer — cannot create a student',
      ),
    )
  })

  it('rejects a missing existing student, names a code in use, and rejects a missing staff member', async () => {
    await expect(
      approve(SEED.registrations.pending, {
        existingStudentId: '30000000-0000-0000-0000-0000000000ff',
      }),
    ).rejects.toEqual(new DbError('Existing student not found'))

    await db
      .update(students)
      .set({ studentCode: 'TAKEN' })
      .where(eq(students.id, SEED.students.alice))
    // The action turns this constraint into an error on the code field.
    const taken = await approve(SEED.registrations.pending, {
      studentCode: 'TAKEN',
    }).catch((e: unknown) => e)
    expect(asDbError(taken)).toMatchObject({
      code: '23505',
      constraint: 'students_student_code_key',
    })

    await expect(
      approve(SEED.registrations.pending, {
        staffId: '00000000-0000-0000-0000-0000000000ff',
      }),
    ).rejects.toEqual(
      new DbError(
        'Invalid class or student reference — a record may have been deleted',
      ),
    )
  })

  it('leaves nothing behind when a write fails part-way', async () => {
    const id = await submitFor({
      last_name: 'AliceGuardian',
      phone: '07900000001',
      email: 'gary.alice@example.com',
    })
    const counts = {
      guardians: await rowCount(guardians),
      students: await rowCount(students),
    }

    // Guardians, student and enrolment are written before the submission's
    // status update fails.
    const err = await failWritesTo(
      'registration_submissions',
      "status <> 'actioned'",
      () => approve(id, { classId: SEED.classes.gamma }),
    )
    expect(err).toEqual(
      new DbError('Student address is incomplete — cannot approve'),
    )
    expect({
      guardians: await rowCount(guardians),
      students: await rowCount(students),
    }).toEqual(counts)
    expect(await guardian(SEED.guardians.gary)).toMatchObject({
      phone: '07711000001',
    })
    const gammaStays = await db
      .select()
      .from(studentClasses)
      .where(
        and(
          eq(studentClasses.classId, SEED.classes.gamma),
          isNull(studentClasses.endDate),
        ),
      )
    expect(gammaStays).toEqual([])
    expect(await getRegistrationSubmissionById(id)).toMatchObject({
      status: 'pending',
    })
  })
})
