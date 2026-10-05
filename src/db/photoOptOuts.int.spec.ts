import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { DbError } from '@/lib/db-error'

import { db } from './client'
import {
  applyPhotoOptOut,
  createPhotoOptOut,
  deletePhotoOptOut,
  getPendingPhotoOptOutCount,
  getPhotoOptOutById,
  getPhotoOptOuts,
  rejectPhotoOptOut,
} from './photoOptOuts'
import { students } from './schema'
import { failWritesTo, resetDatabase, SEED } from './test-db'

afterAll(resetDatabase)

type PhotoConsent = {
  consent: boolean
  withdrawnAt: string | null
  withdrawnBy: string | null
}

async function bobConsent(): Promise<PhotoConsent> {
  const [bob] = await db
    .select({
      consent: students.photoVideoConsent,
      withdrawnAt: students.photoVideoConsentWithdrawnAt,
      withdrawnBy: students.photoVideoConsentWithdrawnBy,
    })
    .from(students)
    .where(eq(students.id, SEED.students.bob))
  return bob
}

const request = {
  child_first_name: 'Bob',
  child_last_name: 'Student',
  date_of_birth: '2016-01-01',
  declaration_name: 'Grace BobGuardian',
}

describe('photo opt-outs', () => {
  it('creates a pending request and lists it', async () => {
    const { id } = await createPhotoOptOut(request)
    expect(await getPhotoOptOutById(id)).toMatchObject({
      status: 'pending',
      child_first_name: 'Bob',
      student_id: null,
      submitted_at: expect.any(String),
    })
    expect(await getPendingPhotoOptOutCount()).toBe(2)
    expect((await getPhotoOptOuts('pending')).map((r) => r.id)).toContain(id)
    expect(await getPhotoOptOuts('rejected')).toEqual([])
    expect(
      await getPhotoOptOutById('82000000-0000-0000-0000-0000000000ff'),
    ).toBeNull()
    expect(await getPhotoOptOutById('not-a-uuid')).toBeNull()
  })

  it('applies a request: withdraws the student’s consent and records who', async () => {
    const { id } = await createPhotoOptOut(request)
    await db
      .update(students)
      .set({ photoVideoConsent: true })
      .where(eq(students.id, SEED.students.bob))

    expect(
      await applyPhotoOptOut({
        requestId: id,
        staffId: SEED.staff.admin,
        studentId: SEED.students.bob,
      }),
    ).toBe(SEED.students.bob)
    expect(await getPhotoOptOutById(id)).toMatchObject({
      status: 'actioned',
      student_id: SEED.students.bob,
      actioned_by: SEED.staff.admin,
      actioned_at: expect.any(String),
    })
    const bob = await bobConsent()
    expect(bob).toEqual({
      consent: false,
      withdrawnAt: expect.any(String),
      withdrawnBy: SEED.staff.admin,
    })

    // A second request for a child whose consent is already off keeps the
    // original withdrawal record.
    const second = await createPhotoOptOut(request)
    await applyPhotoOptOut({
      requestId: second.id,
      staffId: SEED.staff.secretary,
      studentId: SEED.students.bob,
    })
    expect(await bobConsent()).toEqual(bob)
    expect(await getPhotoOptOutById(second.id)).toMatchObject({
      status: 'actioned',
    })
  })

  it('rejects an actioned or missing request, and a missing student', async () => {
    const { id } = await createPhotoOptOut(request)
    const apply = (requestId: string, studentId: string): Promise<string> =>
      applyPhotoOptOut({ requestId, staffId: SEED.staff.admin, studentId })

    await expect(
      apply('82000000-0000-0000-0000-0000000000ff', SEED.students.bob),
    ).rejects.toEqual(new DbError('Request not found or already actioned'))
    await expect(
      apply(id, '30000000-0000-0000-0000-0000000000ff'),
    ).rejects.toEqual(new DbError('Student not found'))
    expect(await getPhotoOptOutById(id)).toMatchObject({ status: 'pending' })

    await apply(id, SEED.students.bob)
    await expect(apply(id, SEED.students.bob)).rejects.toEqual(
      new DbError('Request not found or already actioned'),
    )
  })

  it('leaves nothing behind when a write fails part-way', async () => {
    const { id } = await createPhotoOptOut(request)
    await db
      .update(students)
      .set({
        photoVideoConsent: true,
        photoVideoConsentWithdrawnAt: null,
        photoVideoConsentWithdrawnBy: null,
      })
      .where(eq(students.id, SEED.students.bob))

    // The consent is withdrawn before the request update fails.
    const err = await failWritesTo(
      'photo_consent_opt_outs',
      "status <> 'actioned'",
      () =>
        applyPhotoOptOut({
          requestId: id,
          staffId: SEED.staff.admin,
          studentId: SEED.students.bob,
        }),
    )
    expect(err).toBeDefined()
    expect(await bobConsent()).toEqual({
      consent: true,
      withdrawnAt: null,
      withdrawnBy: null,
    })
    expect(await getPhotoOptOutById(id)).toMatchObject({ status: 'pending' })
  })

  it('rejects a pending request once, then deletes it', async () => {
    const reject = {
      requestId: SEED.photoOptOut,
      staffId: SEED.staff.admin,
      reason: 'Not ours',
    }
    await rejectPhotoOptOut(reject)
    expect(await getPhotoOptOutById(SEED.photoOptOut)).toMatchObject({
      status: 'rejected',
      rejected_reason: 'Not ours',
    })
    await expect(rejectPhotoOptOut(reject)).rejects.toThrow(
      'Request not found or already actioned',
    )
    await deletePhotoOptOut(SEED.photoOptOut)
    await expect(deletePhotoOptOut(SEED.photoOptOut)).rejects.toThrow(
      'Request not found',
    )
  })
})
