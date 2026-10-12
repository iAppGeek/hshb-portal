import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { asDbError } from '@/lib/db-error'

import {
  getAttendanceByClassAndDate,
  getAttendanceByDateRange,
  getRegister,
  getRegistersByDateRange,
  getStudentAttendanceDays,
  getStudentAttendanceTotals,
  getWorstAttenders,
  saveAttendance,
  type AttendanceStatus,
} from './attendance'
import { db } from './client'
import { classes, studentClasses, students } from './schema'
import { resetDatabase, SEED } from './test-db'

afterAll(resetDatabase)

function mark(
  studentId: string,
  date: string,
  status: AttendanceStatus,
  notes: string | null = null,
): Parameters<typeof saveAttendance>[0][number] {
  return {
    class_id: SEED.classes.alpha,
    student_id: studentId,
    date,
    status,
    notes,
    recorded_by: SEED.staff.teacher,
  }
}

function register(
  date: string,
  notes: string | null = null,
): Parameters<typeof saveAttendance>[1] {
  return {
    classId: SEED.classes.alpha,
    date,
    notes,
    updatedBy: SEED.staff.teacher,
  }
}

const ALICE_ALPHA = '40000000-0000-0000-0000-000000000001'

function markIn(
  classId: string,
  studentId: string,
  date: string,
  status: AttendanceStatus,
): Parameters<typeof saveAttendance>[0][number] {
  return {
    class_id: classId,
    student_id: studentId,
    date,
    status,
    notes: null,
    recorded_by: SEED.staff.teacher,
  }
}

function registerFor(
  classId: string,
  date: string,
): Parameters<typeof saveAttendance>[1] {
  return {
    classId,
    date,
    notes: null,
    updatedBy: SEED.staff.teacher,
  }
}

describe('student attendance days', () => {
  it('counts present, late and absent, newest first', async () => {
    await saveAttendance(
      [mark(SEED.students.alice, '2026-12-01', 'present')],
      register('2026-12-01'),
    )
    await saveAttendance(
      [mark(SEED.students.alice, '2026-12-02', 'late')],
      register('2026-12-02'),
    )
    await saveAttendance(
      [mark(SEED.students.alice, '2026-12-03', 'absent')],
      register('2026-12-03'),
    )

    expect(
      await getStudentAttendanceDays(
        SEED.students.alice,
        '2026-12-01',
        '2026-12-03',
      ),
    ).toEqual([
      { date: '2026-12-03', status: 'absent', classNames: ['Alpha'] },
      { date: '2026-12-02', status: 'late', classNames: ['Alpha'] },
      { date: '2026-12-01', status: 'present', classNames: ['Alpha'] },
    ])
    expect(
      await getStudentAttendanceTotals(
        SEED.students.alice,
        '2026-12-01',
        '2026-12-03',
      ),
    ).toEqual({
      studentId: SEED.students.alice,
      possible: 3,
      attended: 2,
      late: 1,
      absent: 1,
      unmarked: 0,
    })
  })

  it('counts a taken register with no mark as unmarked', async () => {
    await saveAttendance(
      [mark(SEED.students.bob, '2026-12-04', 'present')],
      register('2026-12-04'),
    )

    expect(
      await getStudentAttendanceDays(
        SEED.students.alice,
        '2026-12-04',
        '2026-12-04',
      ),
    ).toEqual([
      { date: '2026-12-04', status: 'unmarked', classNames: ['Alpha'] },
    ])
    expect(
      await getStudentAttendanceTotals(
        SEED.students.alice,
        '2026-12-04',
        '2026-12-04',
      ),
    ).toMatchObject({ possible: 1, attended: 0, unmarked: 1 })
  })

  it('ignores a register for a class the student was not in', async () => {
    await saveAttendance(
      [markIn(SEED.classes.beta, SEED.students.carol, '2026-12-05', 'present')],
      registerFor(SEED.classes.beta, '2026-12-05'),
    )

    expect(
      await getStudentAttendanceTotals(
        SEED.students.alice,
        '2026-12-05',
        '2026-12-05',
      ),
    ).toMatchObject({ possible: 0, attended: 0 })
    expect(
      await getStudentAttendanceDays(
        SEED.students.alice,
        '2026-12-05',
        '2026-12-05',
      ),
    ).toEqual([])
  })

  it('counts each class only within its stay', async () => {
    await db
      .update(studentClasses)
      .set({ endDate: '2026-12-07' })
      .where(eq(studentClasses.id, ALICE_ALPHA))
    const [betaStay] = await db
      .insert(studentClasses)
      .values({
        studentId: SEED.students.alice,
        classId: SEED.classes.beta,
        startDate: '2026-12-07',
        endDate: '2026-12-09',
      })
      .returning({ id: studentClasses.id })
    try {
      await saveAttendance(
        [mark(SEED.students.alice, '2026-12-06', 'present')],
        register('2026-12-06'),
      )
      await saveAttendance(
        [mark(SEED.students.bob, '2026-12-08', 'present')],
        register('2026-12-08'),
      )
      await saveAttendance(
        [markIn(SEED.classes.beta, SEED.students.alice, '2026-12-08', 'late')],
        registerFor(SEED.classes.beta, '2026-12-08'),
      )

      expect(
        await getStudentAttendanceDays(
          SEED.students.alice,
          '2026-12-06',
          '2026-12-08',
        ),
      ).toEqual([
        { date: '2026-12-08', status: 'late', classNames: ['Beta'] },
        { date: '2026-12-06', status: 'present', classNames: ['Alpha'] },
      ])
    } finally {
      await db.delete(studentClasses).where(eq(studentClasses.id, betaStay.id))
      await db
        .update(studentClasses)
        .set({ endDate: null })
        .where(eq(studentClasses.id, ALICE_ALPHA))
    }
  })

  it('includes a mark on a date after the stay ended', async () => {
    const [stay] = await db
      .insert(studentClasses)
      .values({
        studentId: SEED.students.alice,
        classId: SEED.classes.gamma,
        startDate: '2026-12-01',
        endDate: '2026-12-02',
      })
      .returning({ id: studentClasses.id })
    try {
      await saveAttendance(
        [
          markIn(
            SEED.classes.gamma,
            SEED.students.alice,
            '2026-12-11',
            'present',
          ),
        ],
        registerFor(SEED.classes.gamma, '2026-12-11'),
      )

      expect(
        await getStudentAttendanceDays(
          SEED.students.alice,
          '2026-12-11',
          '2026-12-11',
        ),
      ).toEqual([
        { date: '2026-12-11', status: 'present', classNames: ['Gamma'] },
      ])
    } finally {
      await db.delete(studentClasses).where(eq(studentClasses.id, stay.id))
    }
  })

  it('counts two classes on one date as a single day, never above 100%', async () => {
    const [stay] = await db
      .insert(studentClasses)
      .values({
        studentId: SEED.students.alice,
        classId: SEED.classes.beta,
        startDate: '2026-12-12',
        endDate: '2026-12-14',
      })
      .returning({ id: studentClasses.id })
    try {
      await saveAttendance(
        [mark(SEED.students.alice, '2026-12-12', 'present')],
        register('2026-12-12'),
      )
      await saveAttendance(
        [
          markIn(
            SEED.classes.beta,
            SEED.students.alice,
            '2026-12-12',
            'absent',
          ),
        ],
        registerFor(SEED.classes.beta, '2026-12-12'),
      )
      await saveAttendance(
        [mark(SEED.students.alice, '2026-12-13', 'absent')],
        register('2026-12-13'),
      )
      await saveAttendance(
        [
          markIn(
            SEED.classes.beta,
            SEED.students.carol,
            '2026-12-13',
            'present',
          ),
        ],
        registerFor(SEED.classes.beta, '2026-12-13'),
      )

      expect(
        await getStudentAttendanceDays(
          SEED.students.alice,
          '2026-12-12',
          '2026-12-13',
        ),
      ).toEqual([
        {
          date: '2026-12-13',
          status: 'absent',
          classNames: ['Alpha', 'Beta'],
        },
        {
          date: '2026-12-12',
          status: 'present',
          classNames: ['Alpha', 'Beta'],
        },
      ])
      expect(
        await getStudentAttendanceTotals(
          SEED.students.alice,
          '2026-12-12',
          '2026-12-13',
        ),
      ).toMatchObject({ possible: 2, attended: 1, absent: 1, unmarked: 0 })
    } finally {
      await db.delete(studentClasses).where(eq(studentClasses.id, stay.id))
    }
  })

  it('excludes a register outside the range', async () => {
    await saveAttendance(
      [mark(SEED.students.alice, '2026-12-16', 'present')],
      register('2026-12-16'),
    )

    expect(
      await getStudentAttendanceTotals(
        SEED.students.alice,
        '2026-12-15',
        '2026-12-15',
      ),
    ).toMatchObject({ possible: 0, attended: 0 })
  })

  it('returns zeros when no register was taken', async () => {
    expect(
      await getStudentAttendanceTotals(
        SEED.students.alice,
        '2027-01-04',
        '2027-01-05',
      ),
    ).toEqual({
      studentId: SEED.students.alice,
      possible: 0,
      attended: 0,
      late: 0,
      absent: 0,
      unmarked: 0,
    })
    expect(
      await getStudentAttendanceDays(
        SEED.students.alice,
        '2027-01-04',
        '2027-01-05',
      ),
    ).toEqual([])
  })
})

describe('worst attenders', () => {
  async function pupil(
    firstName: string,
    lastName: string,
    opts: { active?: boolean; leavingReason?: 'left' | null } = {},
  ): Promise<string> {
    const [row] = await db
      .insert(students)
      .values({
        firstName,
        lastName,
        primaryGuardianId: SEED.guardians.gary,
        addressGuardianId: SEED.guardians.gary,
        active: opts.active ?? true,
        leavingReason: opts.leavingReason ?? null,
      })
      .returning({ id: students.id })
    return row.id
  }

  async function klass(name: string, active = true): Promise<string> {
    const [row] = await db
      .insert(classes)
      .values({
        name,
        yearGroup: 'Year 1',
        academicYearId: SEED.years.current,
        teacherId: SEED.staff.teacher,
        active,
      })
      .returning({ id: classes.id })
    return row.id
  }

  async function stay(
    studentId: string,
    classId: string,
    startDate: string,
    endDate: string | null,
  ): Promise<void> {
    await db.insert(studentClasses).values({
      studentId,
      classId,
      startDate,
      endDate,
    })
  }

  async function take(
    classId: string,
    date: string,
    marks: { studentId: string; status: AttendanceStatus }[],
  ): Promise<void> {
    await saveAttendance(
      marks.map((mark) => ({
        class_id: classId,
        student_id: mark.studentId,
        date,
        status: mark.status,
        notes: null,
        recorded_by: SEED.staff.teacher,
      })),
      {
        classId,
        date,
        notes: null,
        updatedBy: SEED.staff.teacher,
      },
    )
  }

  it('orders by percentage, then days missed, then name, and drops 100%', async () => {
    const classId = await klass('Rank')
    const zoeZero = await pupil('Zoe', 'Zero')
    const amyAble = await pupil('Amy', 'Able')
    const patAdams = await pupil('Pat', 'Adams')
    const amyBrown = await pupil('Amy', 'Brown')
    const zoeBrown = await pupil('Zoe', 'Brown')
    const uma = await pupil('Uma', 'Perfect')
    await stay(zoeZero, classId, '2027-02-01', '2027-02-04')
    await stay(amyAble, classId, '2027-02-01', '2027-02-02')
    for (const id of [patAdams, amyBrown, zoeBrown, uma]) {
      await stay(id, classId, '2027-02-01', '2027-02-03')
    }
    await take(classId, '2027-02-01', [
      { studentId: zoeZero, status: 'absent' },
      { studentId: amyAble, status: 'absent' },
      { studentId: patAdams, status: 'present' },
      { studentId: amyBrown, status: 'present' },
      { studentId: zoeBrown, status: 'present' },
      { studentId: uma, status: 'present' },
    ])
    await take(classId, '2027-02-02', [
      { studentId: zoeZero, status: 'absent' },
      { studentId: patAdams, status: 'absent' },
      { studentId: amyBrown, status: 'absent' },
      { studentId: zoeBrown, status: 'absent' },
      { studentId: uma, status: 'present' },
    ])
    await take(classId, '2027-02-03', [
      { studentId: zoeZero, status: 'absent' },
    ])

    const rows = await getWorstAttenders('2027-02-01', '2027-02-03')
    expect(rows.map((row) => `${row.firstName} ${row.lastName}`)).toEqual([
      'Zoe Zero',
      'Amy Able',
      'Pat Adams',
      'Amy Brown',
      'Zoe Brown',
    ])
    expect(rows[0]).toMatchObject({ possible: 3, attended: 0 })
    expect(rows[1]).toMatchObject({ possible: 1, attended: 0 })
    expect(rows[2]).toMatchObject({
      possible: 2,
      attended: 1,
      classNames: ['Rank'],
    })
  })

  it('includes a student who left mid-range, with their leaving reason', async () => {
    const classId = await klass('Leavers')
    const id = await pupil('Lea', 'Ver', {
      active: false,
      leavingReason: 'left',
    })
    await stay(id, classId, '2027-02-10', '2027-02-12')
    await take(classId, '2027-02-10', [{ studentId: id, status: 'absent' }])
    await take(classId, '2027-02-11', [{ studentId: id, status: 'present' }])

    const rows = await getWorstAttenders('2027-02-10', '2027-02-11')
    expect(rows).toEqual([
      expect.objectContaining({
        studentId: id,
        leavingReason: 'left',
        possible: 2,
        attended: 1,
      }),
    ])
  })

  it('excludes a student whose only stay in the range is in an inactive class', async () => {
    const classId = await klass('Closed', false)
    const id = await pupil('Ina', 'Active')
    await stay(id, classId, '2027-02-15', null)
    await take(classId, '2027-02-15', [{ studentId: id, status: 'absent' }])

    expect(await getWorstAttenders('2027-02-15', '2027-02-15')).toEqual([])
  })

  it('excludes a stray mark when no stay overlaps the range', async () => {
    const classId = await klass('Stray')
    const id = await pupil('Sid', 'Mark')
    await stay(id, classId, '2027-02-01', '2027-02-16')
    await take(classId, '2027-02-20', [{ studentId: id, status: 'absent' }])

    expect(await getWorstAttenders('2027-02-20', '2027-02-20')).toEqual([])
  })

  it('counts a day in two classes once', async () => {
    const alpha = await klass('Twin A')
    const beta = await klass('Twin B')
    const id = await pupil('Dual', 'Day')
    await stay(id, alpha, '2027-02-24', '2027-02-26')
    await stay(id, beta, '2027-02-24', '2027-02-25')
    await take(alpha, '2027-02-24', [{ studentId: id, status: 'present' }])
    await take(beta, '2027-02-24', [{ studentId: id, status: 'absent' }])
    await take(alpha, '2027-02-25', [{ studentId: id, status: 'absent' }])

    const [row] = await getWorstAttenders('2027-02-24', '2027-02-25')
    expect(row).toMatchObject({
      studentId: id,
      possible: 2,
      attended: 1,
      absent: 1,
      classNames: ['Twin A', 'Twin B'],
    })
  })
})

describe('attendance', () => {
  it('saves a register and reads it back for the class and date', async () => {
    const { saved } = await saveAttendance(
      [
        mark(SEED.students.alice, '2026-10-12', 'present'),
        mark(SEED.students.bob, '2026-10-12', 'absent', 'Ill'),
      ],
      register('2026-10-12'),
    )
    expect(saved).toHaveLength(2)
    expect(saved[1]).toStrictEqual({
      id: expect.any(String),
      class_id: SEED.classes.alpha,
      student_id: SEED.students.bob,
      date: '2026-10-12',
      status: 'absent',
      notes: 'Ill',
      recorded_by: SEED.staff.teacher,
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
    expect(
      await getAttendanceByClassAndDate(SEED.classes.alpha, '2026-10-12'),
    ).toHaveLength(2)
    expect(
      await getAttendanceByClassAndDate(SEED.classes.beta, '2026-10-12'),
    ).toEqual([])
  })

  it('updates an existing mark in place when the register is saved again', async () => {
    const [before] = await getAttendanceByClassAndDate(
      SEED.classes.alpha,
      '2026-10-12',
    )
    const {
      saved: [after],
    } = await saveAttendance(
      [mark(before.student_id, '2026-10-12', 'late', 'Bus')],
      register('2026-10-12'),
    )
    expect(after.id).toBe(before.id)
    expect(after).toMatchObject({ status: 'late', notes: 'Bus' })
  })

  it('saves nothing for an empty register', async () => {
    expect(await saveAttendance([], register('2026-10-12'))).toEqual({
      saved: [],
      notes: null,
    })
  })

  it('rejects an unknown status', async () => {
    const err = await saveAttendance(
      [
        {
          ...mark(SEED.students.alice, '2026-10-13', 'present'),
          status: 'gone' as AttendanceStatus,
        },
      ],
      register('2026-10-13'),
    ).catch((e: unknown) => e)
    expect(asDbError(err)?.code).toBe('23514')
  })

  it('lists a date range with each row’s class', async () => {
    await saveAttendance(
      [mark(SEED.students.alice, '2026-10-20', 'present')],
      register('2026-10-20'),
    )
    const rows = await getAttendanceByDateRange('2026-10-12', '2026-10-19')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toStrictEqual({
      classId: SEED.classes.alpha,
      studentId: expect.any(String),
      date: '2026-10-12',
      status: expect.any(String),
      class: {
        id: SEED.classes.alpha,
        name: 'Alpha',
        yearGroup: 'Year 1',
        active: true,
        yearCode: '2026-27',
      },
    })
  })

  it('creates the register row on first save and bumps only updated_at after', async () => {
    await saveAttendance(
      [mark(SEED.students.alice, '2026-11-02', 'present')],
      register('2026-11-02'),
    )
    const [first] = await getRegistersByDateRange('2026-11-02', '2026-11-02')
    expect(first).toStrictEqual({
      classId: SEED.classes.alpha,
      date: '2026-11-02',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })

    await new Promise((resolve) => setTimeout(resolve, 20))
    await saveAttendance(
      [mark(SEED.students.alice, '2026-11-02', 'late')],
      register('2026-11-02'),
    )
    const rows = await getRegistersByDateRange('2026-11-02', '2026-11-02')
    expect(rows).toHaveLength(1)
    expect(rows[0].createdAt).toBe(first.createdAt)
    expect(rows[0].updatedAt! > first.updatedAt!).toBe(true)
  })

  it('returns the stored note, and a save without notes leaves it intact', async () => {
    const first = await saveAttendance(
      [mark(SEED.students.alice, '2026-11-06', 'present')],
      register('2026-11-06', 'Kept\nnote'),
    )
    expect(first.notes).toBe('Kept\nnote')

    const second = await saveAttendance(
      [mark(SEED.students.alice, '2026-11-06', 'late')],
      { ...register('2026-11-06'), notes: undefined },
    )
    expect(second.notes).toBe('Kept\nnote')
    expect(await getRegister(SEED.classes.alpha, '2026-11-06')).toEqual({
      notes: 'Kept\nnote',
    })
  })

  it('stores no note when the first save has none', async () => {
    const { notes } = await saveAttendance(
      [mark(SEED.students.alice, '2026-11-07', 'present')],
      { ...register('2026-11-07'), notes: undefined },
    )
    expect(notes).toBeNull()
  })

  it('has no register for a class and date that was not taken', async () => {
    expect(await getRegister(SEED.classes.alpha, '2026-11-30')).toBeNull()
    expect(await getRegistersByDateRange('2026-11-30', '2026-11-30')).toEqual(
      [],
    )
  })

  it('keeps line breaks in the notes, overwrites them on each save and clears them with null', async () => {
    const save = (notes: string | null): Promise<unknown> =>
      saveAttendance(
        [mark(SEED.students.alice, '2026-11-03', 'present')],
        register('2026-11-03', notes),
      )

    await save('Fire drill\nLate start')
    expect(await getRegister(SEED.classes.alpha, '2026-11-03')).toEqual({
      notes: 'Fire drill\nLate start',
    })

    await save('Replaced')
    expect(await getRegister(SEED.classes.alpha, '2026-11-03')).toEqual({
      notes: 'Replaced',
    })

    await save(null)
    expect(await getRegister(SEED.classes.alpha, '2026-11-03')).toEqual({
      notes: null,
    })
  })

  it('leaves the register unsaved when the marks are rejected', async () => {
    await saveAttendance(
      [
        {
          ...mark(SEED.students.alice, '2026-11-04', 'present'),
          status: 'gone' as AttendanceStatus,
        },
      ],
      register('2026-11-04', 'Never saved'),
    ).catch(() => undefined)
    expect(await getRegister(SEED.classes.alpha, '2026-11-04')).toBeNull()
  })

  it('deletes the register with its class', async () => {
    await saveAttendance(
      [mark(SEED.students.alice, '2026-11-05', 'present')],
      register('2026-11-05'),
    )
    await db.delete(classes).where(eq(classes.id, SEED.classes.alpha))
    expect(await getRegister(SEED.classes.alpha, '2026-11-05')).toBeNull()
  })
})
