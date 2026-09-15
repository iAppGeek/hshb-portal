import { describe, it, expect } from 'vitest'

import {
  summariseAttendance,
  type AttendanceRangeRow,
  type EnrolmentRangeRow,
  type SummaryClass,
} from './attendanceSummary'

const classA: SummaryClass = {
  id: 'A',
  name: 'Alpha',
  yearCode: '2026-27',
  active: true,
}
const classB: SummaryClass = {
  id: 'B',
  name: 'Beta',
  yearCode: '2026-27',
  active: true,
}

function attendance(
  overrides: Partial<AttendanceRangeRow> & { class: SummaryClass },
): AttendanceRangeRow & { class: SummaryClass } {
  return {
    class_id: overrides.class.id,
    student_id: 's1',
    date: '2026-09-01',
    status: 'present',
    created_at: '2026-09-01T09:00:00Z',
    updated_at: '2026-09-01T09:00:00Z',
    ...overrides,
  }
}

function enrolment(
  overrides: Partial<EnrolmentRangeRow> & { class: SummaryClass },
): EnrolmentRangeRow {
  return {
    class_id: overrides.class.id,
    student_id: 's1',
    start_date: '2026-09-01',
    end_date: null,
    ...overrides,
  }
}

describe('summariseAttendance', () => {
  const dates = ['2026-09-01', '2026-09-02', '2026-09-03']

  it('summarises two classes over three dates', () => {
    const attendanceRows = [
      attendance({
        class: classA,
        student_id: 'alice',
        date: '2026-09-01',
        status: 'present',
      }),
      attendance({
        class: classA,
        student_id: 'alice',
        date: '2026-09-02',
        status: 'absent',
      }),
      attendance({
        class: classB,
        student_id: 'bob',
        date: '2026-09-01',
        status: 'late',
      }),
    ]
    const enrolmentRows = [
      enrolment({ class: classA, student_id: 'alice' }),
      enrolment({ class: classB, student_id: 'bob' }),
    ]

    const result = summariseAttendance(attendanceRows, enrolmentRows, dates)

    expect(result.classes).toHaveLength(2)
    const alpha = result.classes.find((c) => c.class.id === 'A')!
    expect(alpha.present).toBe(1)
    expect(alpha.absent).toBe(1)
    expect(alpha.possible).toBe(3)
    expect(alpha.enrolled).toBe(1)

    const beta = result.classes.find((c) => c.class.id === 'B')!
    expect(beta.present).toBe(1)
    expect(beta.late).toBe(1)

    expect(result.byDate['2026-09-01'].distinctPresent).toBe(2)
    expect(result.byDate['2026-09-01'].classesTaken).toBe(2)
  })

  it('counts a dual-class student once in distinct totals but in both classes present count', () => {
    const attendanceRows = [
      attendance({
        class: classA,
        student_id: 'dual',
        date: '2026-09-01',
        status: 'present',
      }),
      attendance({
        class: classB,
        student_id: 'dual',
        date: '2026-09-01',
        status: 'present',
      }),
    ]
    const enrolmentRows = [
      enrolment({ class: classA, student_id: 'dual' }),
      enrolment({ class: classB, student_id: 'dual' }),
    ]

    const result = summariseAttendance(attendanceRows, enrolmentRows, dates)

    expect(result.byDate['2026-09-01'].distinctPresent).toBe(1)
    expect(result.byDate['2026-09-01'].distinctEnrolled).toBe(1)
    expect(result.classes.find((c) => c.class.id === 'A')!.present).toBe(1)
    expect(result.classes.find((c) => c.class.id === 'B')!.present).toBe(1)
  })

  it('lowers possible when a student leaves mid-range', () => {
    const enrolmentRows = [
      enrolment({
        class: classA,
        student_id: 'leaver',
        start_date: '2026-09-01',
        end_date: '2026-09-02',
      }),
    ]
    const result = summariseAttendance([], enrolmentRows, dates)
    expect(result.classes[0].possible).toBe(1)
  })

  it('counts late toward present', () => {
    const attendanceRows = [
      attendance({ class: classA, student_id: 'alice', status: 'late' }),
    ]
    const result = summariseAttendance(attendanceRows, [], dates)
    expect(result.classes[0].present).toBe(1)
    expect(result.classes[0].late).toBe(1)
  })

  it('a class with enrolments but no marks has possible > 0, present 0, times null', () => {
    const enrolmentRows = [enrolment({ class: classA, student_id: 'alice' })]
    const result = summariseAttendance([], enrolmentRows, dates)
    const summary = result.classes[0]
    expect(summary.possible).toBeGreaterThan(0)
    expect(summary.present).toBe(0)
    expect(summary.firstRecordedAt).toBeNull()
    expect(summary.lastUpdatedAt).toBeNull()
  })

  it('a class with marks but no enrolment in range still appears, with possible 0', () => {
    const attendanceRows = [attendance({ class: classA, student_id: 'alice' })]
    const result = summariseAttendance(attendanceRows, [], dates)
    expect(result.classes).toHaveLength(1)
    expect(result.classes[0].possible).toBe(0)
    expect(result.classes[0].present).toBe(1)
  })

  it('returns no byDate entries for an empty date list', () => {
    const result = summariseAttendance([], [], [])
    expect(result.byDate).toEqual({})
  })

  it('only counts attendance rows whose date is in the requested range', () => {
    const attendanceRows = [
      attendance({
        class: classA,
        student_id: 'alice',
        date: '2026-10-01',
        status: 'present',
      }),
    ]
    const result = summariseAttendance(attendanceRows, [], dates)
    expect(result.byDate['2026-09-01']).toEqual({
      distinctPresent: 0,
      distinctEnrolled: 0,
      distinctLate: 0,
      classesTaken: 0,
    })
  })
})
