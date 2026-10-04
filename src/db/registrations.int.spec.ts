import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { asDbError } from '@/lib/db-error'
import type { Database } from '@/types/database'

import {
  approveRegistration,
  createRegistrationSubmission,
  deleteRegistrationSubmission,
  getPendingRegistrationCount,
  getRegistrationSubmissionById,
  getRegistrationSubmissions,
  rejectRegistration,
} from './registrations'
import { db } from './client'
import { students } from './schema'
import { getStudentById } from './students'
import { resetDatabase, SEED } from './test-db'

afterAll(resetDatabase)

type SubmissionInsert =
  Database['public']['Tables']['registration_submissions']['Insert']

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
} satisfies Partial<SubmissionInsert>

async function submit(
  childFirstName: string,
  consents: Partial<SubmissionInsert> = {},
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

  it('approves a submission into a new student through the RPC', async () => {
    const id = await submit('Ava')
    const result = await approveRegistration({
      submissionId: id,
      staffId: SEED.staff.admin,
      studentCode: 'AVA-1',
      classId: SEED.classes.gamma,
      existingStudentId: null,
      reuseGuardians: true,
    })
    expect(result.linked_existing).toBe(false)
    expect(result.guardians).toHaveLength(2)
    expect((await getRegistrationSubmissionById(id))?.student_id).toBe(
      result.student_id,
    )
  })

  it('names the code constraint when the code is taken', async () => {
    const id = await submit('Bea')
    const err = await approveRegistration({
      submissionId: id,
      staffId: SEED.staff.admin,
      studentCode: 'AVA-1',
      classId: null,
      existingStudentId: null,
      reuseGuardians: true,
    }).catch((e: unknown) => e)
    expect(asDbError(err)).toMatchObject({
      code: '23505',
      constraint: 'students_student_code_key',
    })
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
      consents: Partial<SubmissionInsert>,
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
