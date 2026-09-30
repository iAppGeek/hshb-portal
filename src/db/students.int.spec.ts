import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { todayInSchoolTz } from '@/lib/datetime'
import { asDbError, DbError } from '@/lib/db-error'
import type { LeavingReason } from '@/lib/schemas'

import { db } from './client'
import { classes, guardians, studentClasses, students } from './schema'
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
  saveStudent,
  StudentChangedError,
  searchStudents,
  updateStudent,
  updateStudentClasses,
  withdrawPhotoVideoConsent,
  type GuardianSlot,
} from './students'
import { failWritesTo, resetDatabase, SEED } from './test-db'

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
      photo_video_consent: true,
    })
    await updateStudent(id, { student_code: 'E-1', allergies: 'Dust' })
    expect(await getStudentById(id)).toMatchObject({
      first_name: 'Eve',
      student_code: 'E-1',
      allergies: 'Dust',
      photo_video_consent: true,
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

  it('moves a student between classes', async () => {
    await updateStudentClasses(SEED.students.carol, [SEED.classes.gamma])
    expect(
      (await getStudentById(SEED.students.carol))?.student_classes.map(
        (sc) => sc.class.id,
      ),
    ).toEqual([SEED.classes.gamma])
  })
})

describe('markStudentAsLeaver', () => {
  async function carolNow(): Promise<{
    active: boolean
    leavingReason: string | null
    openStays: number
  }> {
    const [carol] = await db
      .select({
        active: students.active,
        leavingReason: students.leavingReason,
      })
      .from(students)
      .where(eq(students.id, SEED.students.carol))
    const open = await db
      .select({ id: studentClasses.id })
      .from(studentClasses)
      .where(
        and(
          eq(studentClasses.studentId, SEED.students.carol),
          isNull(studentClasses.endDate),
        ),
      )
    return { ...carol, openStays: open.length }
  }

  it('ends every current stay today and records the reason', async () => {
    await markStudentAsLeaver(SEED.students.carol, 'graduated')
    expect(await carolNow()).toEqual({
      active: false,
      leavingReason: 'graduated',
      openStays: 0,
    })
    const ends = await db
      .select({ endDate: studentClasses.endDate })
      .from(studentClasses)
      .where(eq(studentClasses.studentId, SEED.students.carol))
    expect(ends.map((e) => e.endDate)).toContain(todayInSchoolTz())
  })

  it('rejects a missing student, a leaver and an unknown reason', async () => {
    await expect(
      markStudentAsLeaver('30000000-0000-0000-0000-0000000000ff', 'left'),
    ).rejects.toEqual(new DbError('Student not found'))
    await expect(
      markStudentAsLeaver(SEED.students.carol, 'left'),
    ).rejects.toEqual(new DbError('This student has already left.'))
    await expect(
      markStudentAsLeaver(SEED.students.alice, 'expelled' as LeavingReason),
    ).rejects.toEqual(new DbError('Choose a leaving reason.'))
  })

  it('leaves nothing behind when a write fails part-way', async () => {
    // Bob's stays are closed before the student update fails.
    const err = await failWritesTo('students', 'active', () =>
      markStudentAsLeaver(SEED.students.bob, 'left'),
    )
    expect(err).toBeDefined()
    const [bob] = await db
      .select({ active: students.active })
      .from(students)
      .where(eq(students.id, SEED.students.bob))
    expect(bob.active).toBe(true)
    expect(
      (await getStudentById(SEED.students.bob))?.student_classes,
    ).toHaveLength(1)
  })
})

describe('findStudentMatches', () => {
  it('matches last name plus date of birth or first name, case-insensitively', async () => {
    const byDob = await findStudentMatches({
      firstName: 'Someone',
      lastName: 'STUDENT',
      dateOfBirth: '2015-06-01',
    })
    expect(byDob).toEqual([])

    await db
      .update(students)
      .set({ dateOfBirth: '2015-06-01' })
      .where(eq(students.id, SEED.students.alice))
    expect(
      (
        await findStudentMatches({
          firstName: 'Someone',
          lastName: 'STUDENT',
          dateOfBirth: '2015-06-01',
        })
      ).map((m) => m.id),
    ).toEqual([SEED.students.alice])

    expect(
      await findStudentMatches({
        firstName: 'alice',
        lastName: 'student',
        dateOfBirth: '2000-01-01',
      }),
    ).toEqual([
      {
        id: SEED.students.alice,
        first_name: 'Alice',
        last_name: 'Student',
        date_of_birth: '2015-06-01',
        student_code: null,
        active: true,
      },
    ])
  })

  it('lists active students before leavers', async () => {
    await db
      .update(students)
      .set({ active: false, leavingReason: 'left' })
      .where(eq(students.id, SEED.students.carol))
    await db
      .update(students)
      .set({ dateOfBirth: '2015-06-01' })
      .where(eq(students.id, SEED.students.alice))

    const matches = await findStudentMatches({
      firstName: 'Carol',
      lastName: 'Student',
      dateOfBirth: '2015-06-01',
    })
    expect(matches.map((m) => [m.first_name, m.active])).toEqual([
      ['Alice', true],
      ['Carol', false],
    ])
  })
})

/** The student's `updated_at`, as an edit form loads it. */
async function loadedAt(id: string): Promise<string | null> {
  const [row] = await db
    .select({ updatedAt: students.updatedAt })
    .from(students)
    .where(eq(students.id, id))
  return row.updatedAt
}

describe('saveStudent', () => {
  const newGuardian = (firstName: string): GuardianSlot => ({
    create: { first_name: firstName, last_name: 'Saved', phone: '07700900000' },
  })

  async function guardianNamed(firstName: string): Promise<string | undefined> {
    const [row] = await db
      .select({ id: guardians.id })
      .from(guardians)
      .where(eq(guardians.firstName, firstName))
    return row?.id
  }

  it('creates new guardians and the student linked to them', async () => {
    const { id } = await saveStudent(
      null,
      { first_name: 'Sam', last_name: 'Saved', student_code: 'SV-1' },
      {
        primary: newGuardian('Petra'),
        secondary: null,
        contact1: { id: SEED.guardians.greg },
        contact2: null,
      },
      true,
    )
    const petra = await guardianNamed('Petra')
    expect(await getStudentById(id)).toMatchObject({
      student_code: 'SV-1',
      primary_guardian_id: petra,
      additional_contact_1_id: SEED.guardians.greg,
      address_guardian_id: petra,
    })
  })

  it('updates a student, creating a guardian entered as new', async () => {
    const { id } = await saveStudent(
      SEED.students.bob,
      {
        first_name: 'Bob',
        last_name: 'Student',
        student_code: 'SV-2',
        address_line_1: '1 Road',
        city: 'Town',
        postcode: 'AB1 2CD',
      },
      {
        primary: { id: SEED.guardians.grace },
        secondary: newGuardian('Simon'),
        contact1: null,
        contact2: null,
      },
      false,
    )
    expect(id).toBe(SEED.students.bob)
    expect(await getStudentById(id)).toMatchObject({
      student_code: 'SV-2',
      secondary_guardian_id: await guardianNamed('Simon'),
      address_guardian_id: null,
      city: 'Town',
    })
  })

  it('creates no guardians when the student write is refused', async () => {
    const err = await saveStudent(
      null,
      { first_name: 'Dup', last_name: 'Code', student_code: 'SV-1' },
      {
        primary: newGuardian('Orphan'),
        secondary: null,
        contact1: null,
        contact2: null,
      },
      true,
    ).catch((e: unknown) => e)
    expect(asDbError(err)).toMatchObject({
      code: '23505',
      constraint: 'students_student_code_key',
    })
    expect(await guardianNamed('Orphan')).toBeUndefined()
  })

  describe('an edit', () => {
    const carol = {
      first_name: 'Carol',
      last_name: 'Student',
      address_line_1: '3 Road',
      city: 'Town',
      postcode: 'AB3 4CD',
    }

    it('is saved when the student has not changed since the form loaded', async () => {
      await saveStudent(
        SEED.students.carol,
        { ...carol, notes: 'Saved' },
        {
          primary: { id: SEED.guardians.greg },
          secondary: null,
          contact1: null,
          contact2: null,
        },
        false,
        {
          savedBy: SEED.staff.admin,
          loadedAt: await loadedAt(SEED.students.carol),
        },
      )
      expect(await getStudentById(SEED.students.carol)).toMatchObject({
        notes: 'Saved',
      })
    })

    it('is refused, creating no guardians, once someone else has saved the student', async () => {
      const formLoadedAt = await loadedAt(SEED.students.carol)
      await updateStudent(SEED.students.carol, {
        may_leave_unaccompanied: true,
      })

      const err = await saveStudent(
        SEED.students.carol,
        { ...carol, may_leave_unaccompanied: false },
        {
          primary: { id: SEED.guardians.greg },
          secondary: newGuardian('Stale'),
          contact1: null,
          contact2: null,
        },
        false,
        { savedBy: SEED.staff.admin, loadedAt: formLoadedAt },
      ).catch((e: unknown) => e)

      expect(err).toBeInstanceOf(StudentChangedError)
      expect(await getStudentById(SEED.students.carol)).toMatchObject({
        may_leave_unaccompanied: true,
      })
      expect(await guardianNamed('Stale')).toBeUndefined()
    })
  })
})

describe('photo/video consent withdrawal', () => {
  async function withdrawal(id: string): Promise<{
    consent: boolean
    at: string | null
    by: string | null
  }> {
    const [row] = await db
      .select({
        consent: students.photoVideoConsent,
        at: students.photoVideoConsentWithdrawnAt,
        by: students.photoVideoConsentWithdrawnBy,
      })
      .from(students)
      .where(eq(students.id, id))
    return row
  }

  it('records who withdrew consent and when, keeping the first record', async () => {
    await updateStudent(SEED.students.alice, { photo_video_consent: true })

    await withdrawPhotoVideoConsent(SEED.students.alice, SEED.staff.secretary)
    const first = await withdrawal(SEED.students.alice)
    expect(first).toEqual({
      consent: false,
      at: expect.any(String),
      by: SEED.staff.secretary,
    })

    await withdrawPhotoVideoConsent(SEED.students.alice, SEED.staff.admin)
    expect(await withdrawal(SEED.students.alice)).toEqual(first)
  })

  it('fails for a missing student', async () => {
    await expect(
      withdrawPhotoVideoConsent(
        '30000000-0000-0000-0000-0000000000ff',
        SEED.staff.admin,
      ),
    ).rejects.toThrow('Student not found')
  })

  it('records the admin who unticks it on the edit form, and clears that when given again', async () => {
    async function save(photo: boolean, savedBy: string): Promise<void> {
      await saveStudent(
        SEED.students.carol,
        {
          first_name: 'Carol',
          last_name: 'Student',
          address_line_1: '3 Road',
          city: 'Town',
          postcode: 'AB3 4CD',
          photo_video_consent: photo,
        },
        {
          primary: { id: SEED.guardians.greg },
          secondary: null,
          contact1: null,
          contact2: null,
        },
        false,
        { savedBy, loadedAt: await loadedAt(SEED.students.carol) },
      )
    }

    await save(true, SEED.staff.admin)
    expect(await withdrawal(SEED.students.carol)).toEqual({
      consent: true,
      at: null,
      by: null,
    })

    await save(false, SEED.staff.admin)
    expect(await withdrawal(SEED.students.carol)).toEqual({
      consent: false,
      at: expect.any(String),
      by: SEED.staff.admin,
    })

    await save(true, SEED.staff.admin)
    expect(await withdrawal(SEED.students.carol)).toEqual({
      consent: true,
      at: null,
      by: null,
    })
  })

  it('leaves consent and its withdrawal as they are when a save does not set it', async () => {
    await updateStudent(SEED.students.carol, { photo_video_consent: true })
    await withdrawPhotoVideoConsent(SEED.students.carol, SEED.staff.secretary)
    const withdrawn = await withdrawal(SEED.students.carol)

    await saveStudent(
      SEED.students.carol,
      {
        first_name: 'Carol',
        last_name: 'Student',
        address_line_1: '3 Road',
        city: 'Town',
        postcode: 'AB3 4CD',
        photo_video_consent: undefined,
      },
      {
        primary: { id: SEED.guardians.greg },
        secondary: null,
        contact1: null,
        contact2: null,
      },
      false,
      {
        savedBy: SEED.staff.admin,
        loadedAt: await loadedAt(SEED.students.carol),
      },
    )

    expect(await withdrawal(SEED.students.carol)).toEqual(withdrawn)
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

  it('counts a code saved in lower case', async () => {
    await setCode(SEED.students.alice, 'gk-1010')
    expect(await getNextStudentCode()).toBe('GK-1011')
  })

  it('finds a code held by another student, a leaver included', async () => {
    await setCode(SEED.students.carol, 'GK-1005', false)
    expect(await isStudentCodeTaken('GK-1005', null)).toBe(true)
    expect(await isStudentCodeTaken('GK-1005', SEED.students.alice)).toBe(true)
    expect(await isStudentCodeTaken('GK-1005', SEED.students.carol)).toBe(false)
    expect(await isStudentCodeTaken('GK-7777', null)).toBe(false)
  })

  it('finds a code whatever its case', async () => {
    await setCode(SEED.students.bob, 'gk-1020')
    expect(await isStudentCodeTaken('GK-1020', null)).toBe(true)
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

describe('class order', () => {
  it('sorts a non-stage class by its year group', async () => {
    // Kappa isn't a stage name, so its year group (Year 2) puts it before
    // A Level. Earlier specs move Carol between classes, so only these two
    // are checked.
    const created = await db
      .insert(classes)
      .values(
        [
          { name: 'A Level', yearGroup: 'A Level' },
          { name: 'Kappa', yearGroup: 'Year 2' },
        ].map((cls) => ({ ...cls, academicYearId: SEED.years.current })),
      )
      .returning({ id: classes.id })
    await db.insert(studentClasses).values(
      created.map((cls) => ({
        studentId: SEED.students.carol,
        classId: cls.id,
        startDate: '2026-09-01',
      })),
    )

    const carol = await getStudentById(SEED.students.carol)
    const names = carol?.student_classes.map((sc) => sc.class.name) ?? []
    expect(names.filter((name) => ['A Level', 'Kappa'].includes(name))).toEqual(
      ['Kappa', 'A Level'],
    )
  })
})
