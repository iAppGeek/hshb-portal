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
  saveAttendance,
  type AttendanceStatus,
} from './attendance'
import { db } from './client'
import { classes, studentClasses } from './schema'
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
