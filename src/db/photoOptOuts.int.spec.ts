import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

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
import { resetDatabase, SEED } from './test-db'

afterAll(resetDatabase)

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

  it('applies a request to a student through the RPC', async () => {
    const { id } = await createPhotoOptOut(request)
    await applyPhotoOptOut({
      requestId: id,
      staffId: SEED.staff.admin,
      studentId: SEED.students.bob,
    })
    expect(await getPhotoOptOutById(id)).toMatchObject({
      status: 'actioned',
      student_id: SEED.students.bob,
    })
    const [bob] = await db
      .select({
        consent: students.photoVideoConsent,
        withdrawnAt: students.photoVideoConsentWithdrawnAt,
        withdrawnBy: students.photoVideoConsentWithdrawnBy,
      })
      .from(students)
      .where(eq(students.id, SEED.students.bob))
    expect(bob).toEqual({
      consent: false,
      withdrawnAt: expect.any(String),
      withdrawnBy: SEED.staff.admin,
    })
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
