import { afterAll, describe, expect, it } from 'vitest'

import { db } from './client'
import { staffAttendance } from './schema'
import {
  getStaffAttendanceByDate,
  getStaffAttendanceByDateRange,
  getStaffAttendanceForToday,
  getStaffAttendedCount,
  signInStaff,
  signOutStaff,
} from './staff-attendance'
import { SEED } from './test-db'

const DAY = '2026-10-05'
const NEXT_DAY = '2026-10-06'

afterAll(async () => {
  await db.delete(staffAttendance)
})

describe('staff attendance', () => {
  it('signs in, reads back and counts the day', async () => {
    const row = await signInStaff(
      SEED.staff.teacher,
      DAY,
      '2026-10-05T08:30:00.000Z',
    )
    expect(row).toStrictEqual({
      id: expect.any(String),
      staff_id: SEED.staff.teacher,
      date: DAY,
      signed_in_at: '2026-10-05T08:30:00+00:00',
      signed_out_at: null,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
    expect(await getStaffAttendanceForToday(SEED.staff.teacher, DAY)).toEqual(
      row,
    )
    await signInStaff(SEED.staff.admin, DAY, '2026-10-05T08:45:00.000Z')
    expect(await getStaffAttendedCount(DAY)).toBe(2)
    expect(await getStaffAttendanceByDate(DAY)).toHaveLength(2)
  })

  it('signs out, and a second sign-in reopens the same record', async () => {
    const out = await signOutStaff(
      SEED.staff.teacher,
      DAY,
      '2026-10-05T15:00:00.000Z',
    )
    expect(out?.signed_out_at).toBe('2026-10-05T15:00:00+00:00')

    const again = await signInStaff(
      SEED.staff.teacher,
      DAY,
      '2026-10-05T16:00:00.000Z',
    )
    expect(again.id).toBe(out?.id)
    expect(again.signed_in_at).toBe('2026-10-05T16:00:00+00:00')
    expect(again.signed_out_at).toBeNull()
    // Still counted once for the day.
    expect(await getStaffAttendedCount(DAY)).toBe(2)
  })

  it('returns null when signing out with no record, or reading a missing day', async () => {
    expect(
      await signOutStaff(SEED.staff.secretary, DAY, '2026-10-05T15:00:00Z'),
    ).toBeNull()
    expect(
      await getStaffAttendanceForToday(SEED.staff.secretary, DAY),
    ).toBeNull()
  })

  it('lists a date range oldest first', async () => {
    await signInStaff(SEED.staff.teacher, NEXT_DAY, '2026-10-06T08:30:00Z')
    const rows = await getStaffAttendanceByDateRange(DAY, NEXT_DAY)
    expect(rows.map((r) => r.date)).toEqual([DAY, DAY, NEXT_DAY])
    expect(
      await getStaffAttendanceByDateRange(NEXT_DAY, NEXT_DAY),
    ).toHaveLength(1)
  })
})
