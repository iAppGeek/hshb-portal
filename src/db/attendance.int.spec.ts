import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { asDbError } from '@/lib/db-error'

import {
  getAttendanceByClassAndDate,
  getAttendanceByDateRange,
  getRegister,
  getRegistersByDateRange,
  saveAttendance,
  type AttendanceStatus,
} from './attendance'
import { db } from './client'
import { classes } from './schema'
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
