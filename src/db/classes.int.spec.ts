import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'

import { asDbError, DbError } from '@/lib/db-error'

import {
  createClass,
  migrateClass,
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
import { academicYears, classes, studentClasses, students } from './schema'
import { failWritesTo, resetDatabase, SEED } from './test-db'

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
    expect(await getClassById('not-a-uuid')).toBeNull()
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
      'classId',
      'endDate',
      'startDate',
      'studentId',
    ])
  })
})

describe('getEnrolmentsInRange', () => {
  it('includes stays overlapping the range and nothing else', async () => {
    const during = await getEnrolmentsInRange('2026-09-05', '2026-09-05')
    expect(
      during.filter((r) => r.studentId === SEED.students.carol),
    ).toHaveLength(2)

    // The week in Alpha ended on the 8th, so it no longer covers that day.
    const onEnd = await getEnrolmentsInRange('2026-09-08', '2026-09-08')
    expect(
      onEnd
        .filter((r) => r.studentId === SEED.students.carol)
        .map((r) => r.classId),
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

  it('refuses to change a class’s academic year', async () => {
    await expect(
      updateClass(SEED.classes.gamma, {
        academic_year_id: SEED.years.prior,
      } as Parameters<typeof updateClass>[1]),
    ).rejects.toEqual(new DbError("A class's academic year cannot be changed"))
  })

  it('sets a class’s students', async () => {
    await setClassStudents(SEED.classes.alpha, [SEED.students.alice])
    const alpha = await getClassById(SEED.classes.alpha)
    expect(alpha?.student_classes.map((sc) => sc.student_id)).toEqual([
      SEED.students.alice,
    ])
  })
})

describe('migrateClass', () => {
  const { alpha } = SEED.classes
  const { alice, bob } = SEED.students

  beforeEach(resetDatabase)

  async function addYear(
    code: string,
    startDate: string,
    endDate: string,
  ): Promise<string> {
    const [year] = await db
      .insert(academicYears)
      .values({ code, startDate, endDate })
      .returning({ id: academicYears.id })
    return year.id
  }

  const newClass = (
    academicYearId: string,
  ): {
    name: string
    year_group: string
    room_number: string | null
    academic_year_id: string
    teacher_id: string
  } => ({
    name: 'Alpha 2',
    year_group: 'Year 2',
    room_number: null,
    academic_year_id: academicYearId,
    teacher_id: SEED.staff.teacher,
  })

  async function staysOf(
    studentId: string,
  ): Promise<{ classId: string; startDate: string; endDate: string | null }[]> {
    return db
      .select({
        classId: studentClasses.classId,
        startDate: studentClasses.startDate,
        endDate: studentClasses.endDate,
      })
      .from(studentClasses)
      .where(eq(studentClasses.studentId, studentId))
  }

  async function isActive(
    table: 'classes' | 'students',
    id: string,
  ): Promise<boolean> {
    const t = table === 'classes' ? classes : students
    const [row] = await db
      .select({ active: t.active })
      .from(t)
      .where(eq(t.id, id))
    return row.active
  }

  it('moves students into a new class next year and retires the source', async () => {
    const nextYear = await addYear('2027-28', '2027-09-01', '2028-08-31')

    const result = await migrateClass({
      sourceClassId: alpha,
      studentActions: { [alice]: 'move', [bob]: 'graduated' },
      newClass: newClass(nextYear),
    })

    expect(result).toEqual({
      new_class_id: expect.any(String),
      moved: 1,
      unassigned: 0,
      leavers: 1,
    })
    expect(await isActive('classes', alpha)).toBe(false)
    // Stays in the source end the day after its year; moves start the target year.
    expect(await staysOf(alice)).toEqual(
      expect.arrayContaining([
        { classId: alpha, startDate: '2026-09-01', endDate: '2027-09-01' },
        {
          classId: result.new_class_id,
          startDate: '2027-09-01',
          endDate: null,
        },
      ]),
    )
    expect(await isActive('students', bob)).toBe(false)
    expect(await staysOf(bob)).toEqual([
      { classId: alpha, startDate: '2026-09-01', endDate: '2027-09-01' },
    ])
  })

  it('retires a class without a new one, leaving students unassigned', async () => {
    const result = await migrateClass({
      sourceClassId: alpha,
      studentActions: { [alice]: 'none', [bob]: 'left' },
      newClass: null,
    })
    expect(result).toEqual({
      new_class_id: null,
      moved: 0,
      unassigned: 1,
      leavers: 1,
    })
    expect(await isActive('classes', alpha)).toBe(false)
    expect(await isActive('students', alice)).toBe(true)
    const open = await db
      .select()
      .from(studentClasses)
      .where(
        and(eq(studentClasses.classId, alpha), isNull(studentClasses.endDate)),
      )
    expect(open).toEqual([])
  })

  it('rejects a missing or inactive source class', async () => {
    await expect(
      migrateClass({
        sourceClassId: MISSING,
        studentActions: {},
        newClass: null,
      }),
    ).rejects.toEqual(new DbError('Source class not found'))

    await db.update(classes).set({ active: false }).where(eq(classes.id, alpha))
    await expect(
      migrateClass({
        sourceClassId: alpha,
        studentActions: {},
        newClass: null,
      }),
    ).rejects.toEqual(new DbError('Source class is already inactive'))
  })

  it('rejects incomplete new class details and moves without a new class', async () => {
    const actions = { [alice]: 'move', [bob]: 'none' } as const
    await expect(
      migrateClass({
        sourceClassId: alpha,
        studentActions: actions,
        newClass: { ...newClass(SEED.years.current), teacher_id: '' },
      }),
    ).rejects.toEqual(new DbError('Fill in the new class details'))
    await expect(
      migrateClass({
        sourceClassId: alpha,
        studentActions: actions,
        newClass: null,
      }),
    ).rejects.toEqual(
      new DbError('Students can only move when a new class is created'),
    )
  })

  it('rejects actions that no longer match the class, or an unknown action', async () => {
    await expect(
      migrateClass({
        sourceClassId: alpha,
        studentActions: { [alice]: 'none' },
        newClass: null,
      }),
    ).rejects.toEqual(
      new DbError(
        'The class changed since the form was loaded. Reload and try again.',
      ),
    )
    await expect(
      migrateClass({
        sourceClassId: alpha,
        studentActions: {
          [alice]: 'none',
          [bob]: 'expelled' as 'left',
        },
        newClass: null,
      }),
    ).rejects.toEqual(new DbError('Invalid action for a student'))
  })

  it('rejects a target year that is not after the source, or is in the past', async () => {
    await expect(
      migrateClass({
        sourceClassId: alpha,
        studentActions: { [alice]: 'none', [bob]: 'none' },
        newClass: newClass(SEED.years.current),
      }),
    ).rejects.toEqual(
      new DbError(
        "Target academic year must be after the source class's academic year",
      ),
    )

    const oldYear = await addYear('2024-25', '2024-09-01', '2025-08-31')
    const [oldClass] = await db
      .insert(classes)
      .values({ name: 'Old', yearGroup: 'Year 1', academicYearId: oldYear })
      .returning({ id: classes.id })
    await expect(
      migrateClass({
        sourceClassId: oldClass.id,
        studentActions: {},
        newClass: newClass(SEED.years.prior),
      }),
    ).rejects.toEqual(
      new DbError("Students can't be moved into a past academic year"),
    )
  })

  it('rejects a duplicate class name and a missing teacher', async () => {
    const nextYear = await addYear('2027-28', '2027-09-01', '2028-08-31')
    await db.insert(classes).values({
      name: 'Alpha 2',
      yearGroup: 'Year 2',
      academicYearId: nextYear,
    })
    const actions = { [alice]: 'none', [bob]: 'none' } as const

    await expect(
      migrateClass({
        sourceClassId: alpha,
        studentActions: actions,
        newClass: newClass(nextYear),
      }),
    ).rejects.toEqual(
      new DbError('Class name "Alpha 2" already exists for this academic year'),
    )
    await expect(
      migrateClass({
        sourceClassId: alpha,
        studentActions: actions,
        newClass: {
          ...newClass(nextYear),
          name: 'Alpha 3',
          teacher_id: '00000000-0000-0000-0000-0000000000ff',
        },
      }),
    ).rejects.toEqual(
      new DbError(
        'Invalid teacher or student reference — a record may have been deleted',
      ),
    )
  })

  it('leaves nothing behind when a write fails part-way', async () => {
    const nextYear = await addYear('2027-28', '2027-09-01', '2028-08-31')

    // Everything but the source class's deactivation succeeds first.
    const err = await failWritesTo(
      'classes',
      `active or id <> '${alpha}'`,
      () =>
        migrateClass({
          sourceClassId: alpha,
          studentActions: { [alice]: 'move', [bob]: 'left' },
          newClass: newClass(nextYear),
        }),
    )
    expect(err).toEqual(
      new DbError('Invalid data for class creation — check required fields'),
    )
    expect(await isActive('classes', alpha)).toBe(true)
    expect(await isActive('students', bob)).toBe(true)
    const created = await db
      .select()
      .from(classes)
      .where(eq(classes.academicYearId, nextYear))
    expect(created).toEqual([])
    expect(await staysOf(alice)).toEqual([
      { classId: alpha, startDate: '2026-09-01', endDate: null },
    ])
  })
})
