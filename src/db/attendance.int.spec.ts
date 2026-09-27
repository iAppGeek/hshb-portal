import { afterAll, describe, expect, it } from 'vitest'

import { asDbError } from '@/lib/db-error'

import {
  getAttendanceByClassAndDate,
  getAttendanceByDateRange,
  saveAttendance,
  type AttendanceStatus,
} from './attendance'
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

describe('attendance', () => {
  it('saves a register and reads it back for the class and date', async () => {
    const saved = await saveAttendance([
      mark(SEED.students.alice, '2026-10-12', 'present'),
      mark(SEED.students.bob, '2026-10-12', 'absent', 'Ill'),
    ])
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
    const [after] = await saveAttendance([
      mark(before.student_id, '2026-10-12', 'late', 'Bus'),
    ])
    expect(after.id).toBe(before.id)
    expect(after).toMatchObject({ status: 'late', notes: 'Bus' })
  })

  it('saves nothing for an empty register', async () => {
    expect(await saveAttendance([])).toEqual([])
  })

  it('rejects an unknown status', async () => {
    const err = await saveAttendance([
      {
        ...mark(SEED.students.alice, '2026-10-13', 'present'),
        status: 'gone' as AttendanceStatus,
      },
    ]).catch((e: unknown) => e)
    expect(asDbError(err)?.code).toBe('23514')
  })

  it('lists a date range with each row’s class', async () => {
    await saveAttendance([mark(SEED.students.alice, '2026-10-20', 'present')])
    const rows = await getAttendanceByDateRange('2026-10-12', '2026-10-19')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toStrictEqual({
      class_id: SEED.classes.alpha,
      student_id: expect.any(String),
      date: '2026-10-12',
      status: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
      class: {
        id: SEED.classes.alpha,
        name: 'Alpha',
        active: true,
        yearCode: '2026-27',
      },
    })
  })
})
