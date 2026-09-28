import { afterAll, describe, expect, it } from 'vitest'

import {
  approveRegistration,
  createRegistrationSubmission,
  deleteRegistrationSubmission,
  getPendingRegistrationCount,
  getRegistrationSubmissionById,
  getRegistrationSubmissions,
  rejectRegistration,
} from './registrations'
import { resetDatabase, SEED } from './test-db'

afterAll(resetDatabase)

async function submit(childFirstName: string): Promise<string> {
  const { id } = await createRegistrationSubmission({
    submission: {
      child_first_name: childFirstName,
      child_last_name: 'Applicant',
      date_of_birth: '2019-05-05',
      address_line_1: '4 New Rd',
      city: 'London',
      postcode: 'N4 4AA',
      declaration_name: 'Pat Parent',
      consent_privacy_notice: true,
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

  it('deletes a submission, and fails for a missing one', async () => {
    const id = await submit('Del')
    await deleteRegistrationSubmission(id)
    expect(await getRegistrationSubmissionById(id)).toBeNull()
    await expect(deleteRegistrationSubmission(id)).rejects.toThrow(
      'Submission not found',
    )
  })
})
