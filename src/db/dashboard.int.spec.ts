import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { saveAttendance } from './attendance'
import { db } from './client'
import { getDashboardStats } from './dashboard'
import { academicYears, studentClasses } from './schema'
import { resetDatabase, SEED } from './test-db'

const TODAY = '2026-10-07'
const S = SEED.students

beforeAll(async () => {
  // Alpha's register is taken: Alice present, Bob late. Carol (Beta) has no
  // mark, and a new student joined Gamma today without one.
  await saveAttendance(
    [
      [S.alice, 'present'],
      [S.bob, 'late'],
    ].map(([studentId, status]) => ({
      class_id: SEED.classes.alpha,
      student_id: studentId,
      date: TODAY,
      status: status as 'present' | 'late',
      notes: null,
      recorded_by: SEED.staff.teacher,
    })),
    {
      classId: SEED.classes.alpha,
      date: TODAY,
      notes: null,
      updatedBy: SEED.staff.teacher,
    },
  )
  // Bob also joins Gamma today (a second stay; still one student).
  await db.insert(studentClasses).values({
    studentId: S.bob,
    classId: SEED.classes.gamma,
    startDate: TODAY,
  })
})
afterAll(resetDatabase)

describe('getDashboardStats', () => {
  it('returns every admin figure', async () => {
    expect(
      await getDashboardStats(
        { role: 'admin', staffId: SEED.staff.admin },
        TODAY,
      ),
    ).toEqual({
      studentCount: 3,
      classCount: 3,
      teacherCount: 3,
      incidentCount: 2,
      lessonPlansToday: 0,
      presentToday: 2,
      enrolledToday: 3,
      registersTakenToday: 1,
      pendingRegistrationCount: 1,
    })
  })

  it('scopes a teacher’s figures to their classes and hides the rest', async () => {
    expect(
      await getDashboardStats(
        { role: 'teacher', staffId: SEED.staff.teacher },
        TODAY,
      ),
    ).toEqual({
      studentCount: 2,
      classCount: 1,
      teacherCount: null,
      incidentCount: null,
      lessonPlansToday: null,
      presentToday: null,
      enrolledToday: null,
      registersTakenToday: null,
      pendingRegistrationCount: null,
    })
  })

  it('shows pending registrations only to roles that review them', async () => {
    const secretary = await getDashboardStats(
      { role: 'secretary', staffId: SEED.staff.secretary },
      TODAY,
    )
    expect(secretary.pendingRegistrationCount).toBe(1)
  })

  it('issues exactly one SQL statement', async () => {
    const unsafe = vi.spyOn(db.$client, 'unsafe')
    await getDashboardStats({ role: 'admin', staffId: SEED.staff.admin }, TODAY)
    expect(unsafe).toHaveBeenCalledTimes(1)
    unsafe.mockRestore()
  })

  it('throws, as before, when no academic year is current', async () => {
    await db
      .update(academicYears)
      .set({ isCurrent: false })
      .where(eq(academicYears.isCurrent, true))
    await expect(
      getDashboardStats({ role: 'admin', staffId: SEED.staff.admin }, TODAY),
    ).rejects.toThrow('No current academic year is set')
    await db
      .update(academicYears)
      .set({ isCurrent: true })
      .where(eq(academicYears.id, SEED.years.current))
  })
})
