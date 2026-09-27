import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asDbError } from '@/lib/db-error'

import {
  createClass,
  getAllClasses,
  getClassById,
  getClassEmailRosters,
  getClassesByAcademicYear,
  getClassesByTeacher,
  getClassWithStudents,
  getEnrolmentsForClass,
  getEnrolmentsInRange,
  setClassStudents,
  updateClass,
} from './classes'
import { db } from './client'
import { studentClasses } from './schema'
import { resetDatabase, SEED } from './test-db'

const MISSING = '10000000-0000-0000-0000-0000000000ff'

beforeAll(async () => {
  // Carol spent a week in Alpha before moving to Beta.
  await db.insert(studentClasses).values({
    studentId: SEED.students.carol,
    classId: SEED.classes.alpha,
    startDate: '2026-09-01',
    endDate: '2026-09-08',
  })
})
afterAll(resetDatabase)

describe('class lists', () => {
  it('lists the current year’s active classes with teacher and year code', async () => {
    const all = await getAllClasses()
    expect(all.map((c) => c.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(all[0]).toStrictEqual({
      id: SEED.classes.alpha,
      name: 'Alpha',
      year_group: 'Year 1',
      room_number: 'R1',
      teacher_id: SEED.staff.teacher,
      created_at: expect.any(String),
      active: true,
      academic_year_id: SEED.years.current,
      academic_year: '2026-27',
      teacher: {
        id: SEED.staff.teacher,
        first_name: 'Tom',
        last_name: 'Teacher',
        display_name: null,
        email: 'teacher@test.hshb.local',
      },
    })
  })

  it('lists by academic year and by teacher', async () => {
    expect(await getClassesByAcademicYear(SEED.years.prior)).toEqual([])
    expect(
      (await getClassesByTeacher(SEED.staff.teacher2)).map((c) => c.name),
    ).toEqual(['Beta'])
    expect(await getClassesByTeacher(SEED.staff.admin)).toEqual([])
  })

  it('builds email rosters for the current year', async () => {
    const { yearCode, classes } = await getClassEmailRosters()
    expect(yearCode).toBe('2026-27')
    expect(classes.map((c) => c.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })
})

describe('single class', () => {
  it('lists only current members on getClassById', async () => {
    const alpha = await getClassById(SEED.classes.alpha)
    expect(alpha?.academic_year).toBe('2026-27')
    expect(
      alpha?.student_classes.map((sc) => sc.student.first_name).sort(),
    ).toEqual(['Alice', 'Bob'])
    expect(await getClassById(MISSING)).toBeNull()
  })

  it('separates the current roster from the full enrolment history', async () => {
    const alpha = await getClassWithStudents(SEED.classes.alpha)
    expect(alpha?.student_classes).toHaveLength(2)
    expect(alpha?.student_classes[0].student.primary_guardian).toEqual(
      expect.objectContaining({ phone: expect.any(String) }),
    )
    expect(alpha?.enrolment_history).toHaveLength(3)
    expect(
      alpha?.enrolment_history.find((h) => h.end_date !== null),
    ).toMatchObject({
      start_date: '2026-09-01',
      end_date: '2026-09-08',
      student: { id: SEED.students.carol, first_name: 'Carol' },
    })
    expect(await getClassWithStudents(MISSING)).toBeNull()
  })

  it('lists every stay for a class', async () => {
    const stays = await getEnrolmentsForClass(SEED.classes.alpha)
    expect(stays).toHaveLength(3)
    expect(Object.keys(stays[0]).sort()).toEqual([
      'class_id',
      'end_date',
      'start_date',
      'student_id',
    ])
  })
})

describe('getEnrolmentsInRange', () => {
  it('includes stays overlapping the range and nothing else', async () => {
    const during = await getEnrolmentsInRange('2026-09-05', '2026-09-05')
    expect(
      during.filter((r) => r.student_id === SEED.students.carol),
    ).toHaveLength(2)

    // The week in Alpha ended on the 8th, so it no longer covers that day.
    const onEnd = await getEnrolmentsInRange('2026-09-08', '2026-09-08')
    expect(
      onEnd
        .filter((r) => r.student_id === SEED.students.carol)
        .map((r) => r.class_id),
    ).toEqual([SEED.classes.beta])

    expect(await getEnrolmentsInRange('2026-08-01', '2026-08-31')).toEqual([])
  })

  it('carries the class as a SummaryClass', async () => {
    const [row] = await getEnrolmentsInRange('2026-09-10', '2026-09-10')
    expect(row.class).toStrictEqual({
      id: expect.any(String),
      name: expect.any(String),
      active: true,
      yearCode: '2026-27',
    })
  })
})

describe('writes', () => {
  it('creates and updates a class', async () => {
    const created = await createClass({
      name: 'Delta',
      year_group: 'Year 4',
      academic_year_id: SEED.years.current,
      teacher_id: SEED.staff.teacher2,
    })
    expect(created).toMatchObject({
      name: 'Delta',
      active: true,
      room_number: null,
    })
    await updateClass(created.id, { room_number: 'R4', name: 'Delta 2' })
    expect(await getClassById(created.id)).toMatchObject({
      name: 'Delta 2',
      room_number: 'R4',
    })
  })

  it('rejects a duplicate name in the same year', async () => {
    const err = await createClass({
      name: 'Alpha',
      year_group: 'Year 1',
      academic_year_id: SEED.years.current,
      teacher_id: SEED.staff.teacher,
    }).catch((e: unknown) => e)
    expect(asDbError(err)?.code).toBe('23505')
  })

  it('sets a class’s students through the set_enrolments RPC', async () => {
    await setClassStudents(SEED.classes.alpha, [SEED.students.alice])
    const alpha = await getClassById(SEED.classes.alpha)
    expect(alpha?.student_classes.map((sc) => sc.student_id)).toEqual([
      SEED.students.alice,
    ])
  })
})
