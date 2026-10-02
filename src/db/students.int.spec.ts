import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asDbError } from '@/lib/db-error'

import { db } from './client'
import { studentClasses, students } from './schema'
import {
  createStudent,
  findStudentMatches,
  getAllStudents,
  getNextStudentCode,
  getStudentById,
  getStudentCount,
  getStudentIdsByTeacher,
  getStudentsByClass,
  getStudentsByIds,
  getStudentsByTeacher,
  getStudentsForLinking,
  getStudentsForList,
  getStudentSummaries,
  getStudentsWithAllergiesCount,
  isStudentCodeTaken,
  markStudentAsLeaver,
  searchStudents,
  updateStudent,
  updateStudentClasses,
} from './students'
import { resetDatabase, SEED } from './test-db'

beforeAll(async () => {
  // Bob spent a week in Beta before settling in Alpha.
  await db.insert(studentClasses).values({
    studentId: SEED.students.bob,
    classId: SEED.classes.beta,
    startDate: '2026-09-01',
    endDate: '2026-09-08',
  })
})
afterAll(resetDatabase)

describe('lists and counts', () => {
  it('lists active students by name', async () => {
    expect(await getStudentsForList()).toHaveLength(3)
    expect(Object.keys((await getStudentsForList())[0]).sort()).toEqual([
      'first_name',
      'id',
      'last_name',
      'student_code',
    ])
  })

  it('summarises each student with their current class names', async () => {
    const summaries = await getStudentSummaries()
    const bob = summaries.find((s) => s.id === SEED.students.bob)
    expect(bob?.student_classes).toEqual([{ class: { name: 'Alpha' } }])
  })

  it('searches first and last names, case-insensitively', async () => {
    expect((await searchStudents('  ALI ')).map((s) => s.first_name)).toEqual([
      'Alice',
    ])
    expect(await searchStudents('student')).toHaveLength(3)
    expect(await searchStudents('   ')).toEqual([])
  })

  it('counts active students and those with allergies', async () => {
    expect(await getStudentCount()).toBe(3)
    expect(await getStudentsWithAllergiesCount()).toBe(1)
  })

  it('lists every student with contacts and current classes', async () => {
    const all = await getAllStudents(false)
    const alice = all.find((s) => s.id === SEED.students.alice)
    expect(alice).toMatchObject({
      first_name: 'Alice',
      address_line_1: '1 Test St',
      primary_guardian: {
        first_name: 'Gary',
        email: 'gary.alice@example.com',
        occupation: 'Bus driver',
        address_line_1: null,
      },
      secondary_guardian: null,
      additional_contact_1: null,
      address_guardian: null,
      student_classes: [
        {
          class: {
            id: SEED.classes.alpha,
            name: 'Alpha',
            year_group: 'Year 1',
            academic_year: '2026-27',
          },
        },
      ],
    })
    expect(
      all.find((s) => s.id === SEED.students.bob)?.student_classes,
    ).toHaveLength(1)
  })

  it('lists students for linking, including inactive ones', async () => {
    const list = await getStudentsForLinking()
    expect(list).toHaveLength(3)
    expect(list[0]).toStrictEqual({
      id: expect.any(String),
      first_name: expect.any(String),
      last_name: 'Student',
      date_of_birth: null,
      student_code: null,
      active: true,
    })
  })
})

describe('by teacher, class and id', () => {
  it('finds the students in a teacher’s active classes', async () => {
    expect(
      (await getStudentsByTeacher(SEED.staff.teacher))
        .map((s) => s.first_name)
        .sort(),
    ).toEqual(['Alice', 'Bob'])
    expect((await getStudentIdsByTeacher(SEED.staff.teacher)).sort()).toEqual(
      [SEED.students.alice, SEED.students.bob].sort(),
    )
    // Bob's week in Beta has ended, so he isn't Sarah's.
    expect(await getStudentIdsByTeacher(SEED.staff.teacher2)).toEqual([
      SEED.students.carol,
    ])
    expect(await getStudentsByTeacher(SEED.staff.admin)).toEqual([])
  })

  it('finds the current students of a class', async () => {
    expect(
      (await getStudentsByClass(SEED.classes.beta)).map((s) => s.first_name),
    ).toEqual(['Carol'])
    expect(await getStudentsByClass(SEED.classes.gamma)).toEqual([])
  })

  it('returns a student with current classes and every stay’s end date', async () => {
    const bob = await getStudentById(SEED.students.bob)
    expect(bob?.secondary_guardian).toMatchObject({ first_name: 'Gary' })
    expect(bob?.secondary_guardian_relationship).toBe('Father')
    expect(bob?.student_classes).toEqual([
      {
        class: {
          id: SEED.classes.alpha,
          name: 'Alpha',
          year_group: 'Year 1',
          teacher_id: SEED.staff.teacher,
          academic_year: '2026-27',
        },
      },
    ])
    expect(bob?.enrolment_end_dates.map((e) => e.end_date).sort()).toEqual(
      ['2026-09-08', null].sort(),
    )
    expect(
      await getStudentById('30000000-0000-0000-0000-0000000000ff'),
    ).toBeNull()
    expect(await getStudentById('not-a-uuid')).toBeNull()
  })

  it('finds students by ids, and nothing for no ids', async () => {
    expect(await getStudentsByIds([])).toEqual([])
    expect(
      (await getStudentsByIds([SEED.students.carol])).map((s) => s.first_name),
    ).toEqual(['Carol'])
  })
})

describe('writes', () => {
  it('creates and updates a student', async () => {
    const { id } = await createStudent({
      first_name: 'Eve',
      last_name: 'New',
      primary_guardian_id: SEED.guardians.grace,
      additional_contact_1_id: SEED.guardians.greg,
      additional_contact_1_relationship: 'Uncle',
      address_guardian_id: SEED.guardians.grace,
      consent_photo_media: true,
    })
    await updateStudent(id, { student_code: 'E-1', allergies: 'Dust' })
    expect(await getStudentById(id)).toMatchObject({
      first_name: 'Eve',
      student_code: 'E-1',
      allergies: 'Dust',
      consent_photo_media: true,
      additional_contact_1: { first_name: 'Greg' },
      additional_contact_1_relationship: 'Uncle',
      address_guardian_id: SEED.guardians.grace,
    })
  })

  it('rejects a student with no address source', async () => {
    const err = await createStudent({
      first_name: 'No',
      last_name: 'Address',
      primary_guardian_id: SEED.guardians.grace,
    }).catch((e: unknown) => e)
    expect(asDbError(err)).toMatchObject({
      code: '23514',
      constraint: 'students_address_source_check',
    })
  })

  it('moves a student between classes and marks a leaver through the RPCs', async () => {
    await updateStudentClasses(SEED.students.carol, [SEED.classes.gamma])
    expect(
      (await getStudentById(SEED.students.carol))?.student_classes.map(
        (sc) => sc.class.id,
      ),
    ).toEqual([SEED.classes.gamma])

    await markStudentAsLeaver(SEED.students.carol, 'graduated')
    const [carol] = await db
      .select({
        active: students.active,
        leavingReason: students.leavingReason,
      })
      .from(students)
      .where(eq(students.id, SEED.students.carol))
    expect(carol).toEqual({ active: false, leavingReason: 'graduated' })
  })

  it('finds possible matches through the RPC', async () => {
    const matches = await findStudentMatches({
      firstName: 'alice',
      lastName: 'STUDENT',
      dateOfBirth: '2015-06-01',
    })
    expect(matches.map((m) => m.id)).toContain(SEED.students.alice)
  })
})

describe('student codes', () => {
  async function setCode(
    id: string,
    studentCode: string | null,
    active = true,
  ): Promise<void> {
    await db
      .update(students)
      .set({ studentCode, active })
      .where(eq(students.id, id))
  }

  it('starts at GK-1001 when no code has the prefix', async () => {
    await setCode(SEED.students.alice, 'XX-5000')
    expect(await getNextStudentCode()).toBe('GK-1001')
  })

  it('offers one after the highest number, leavers included', async () => {
    await setCode(SEED.students.alice, 'GK-999')
    await setCode(SEED.students.bob, 'GK-1004')
    await setCode(SEED.students.carol, 'GK-1005', false)
    expect(await getNextStudentCode()).toBe('GK-1006')
  })

  it('finds a code held by another student, a leaver included', async () => {
    await setCode(SEED.students.carol, 'GK-1005', false)
    expect(await isStudentCodeTaken('GK-1005', null)).toBe(true)
    expect(await isStudentCodeTaken('GK-1005', SEED.students.alice)).toBe(true)
    expect(await isStudentCodeTaken('GK-1005', SEED.students.carol)).toBe(false)
    expect(await isStudentCodeTaken('GK-7777', null)).toBe(false)
  })

  it('refuses a second student with the same code', async () => {
    await setCode(SEED.students.carol, 'GK-1005', false)
    const err = await updateStudent(SEED.students.alice, {
      student_code: 'GK-1005',
    }).catch((e: unknown) => e)
    expect(asDbError(err)).toMatchObject({
      code: '23505',
      constraint: 'students_student_code_key',
    })
  })
})
