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
  yearGroup: 'Year 1',
  yearCode: '2026-27',
  active: true,
}
const classB: SummaryClass = {
  id: 'B',
  name: 'Beta',
  yearGroup: 'Year 2',
  yearCode: '2026-27',
  active: true,
}

function attendance(
  overrides: Partial<AttendanceRangeRow> & { class: SummaryClass },
): AttendanceRangeRow & { class: SummaryClass } {
  return {
    classId: overrides.class.id,
    studentId: 's1',
    date: '2026-09-01',
    status: 'present',
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-01T09:00:00Z',
    ...overrides,
  }
}

function enrolment(
  overrides: Partial<EnrolmentRangeRow> & { class: SummaryClass },
): EnrolmentRangeRow {
  return {
    classId: overrides.class.id,
    studentId: 's1',
    startDate: '2026-09-01',
    endDate: null,
    ...overrides,
  }
}

describe('summariseAttendance', () => {
  const dates = ['2026-09-01', '2026-09-02', '2026-09-03']

  it('summarises two classes over three dates', () => {
    const attendanceRows = [
      attendance({
        class: classA,
        studentId: 'alice',
        date: '2026-09-01',
        status: 'present',
      }),
      attendance({
        class: classA,
        studentId: 'alice',
        date: '2026-09-02',
        status: 'absent',
      }),
      attendance({
        class: classB,
        studentId: 'bob',
        date: '2026-09-01',
        status: 'late',
      }),
    ]
    const enrolmentRows = [
      enrolment({ class: classA, studentId: 'alice' }),
      enrolment({ class: classB, studentId: 'bob' }),
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
        studentId: 'dual',
        date: '2026-09-01',
        status: 'present',
      }),
      attendance({
        class: classB,
        studentId: 'dual',
        date: '2026-09-01',
        status: 'present',
      }),
    ]
    const enrolmentRows = [
      enrolment({ class: classA, studentId: 'dual' }),
      enrolment({ class: classB, studentId: 'dual' }),
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
        studentId: 'leaver',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
      }),
    ]
    const result = summariseAttendance([], enrolmentRows, dates)
    expect(result.classes[0].possible).toBe(1)
  })

  it('counts late toward present', () => {
    const attendanceRows = [
      attendance({ class: classA, studentId: 'alice', status: 'late' }),
    ]
    const result = summariseAttendance(attendanceRows, [], dates)
    expect(result.classes[0].present).toBe(1)
    expect(result.classes[0].late).toBe(1)
  })

  it('a class with enrolments but no marks has possible > 0, present 0, times null', () => {
    const enrolmentRows = [enrolment({ class: classA, studentId: 'alice' })]
    const result = summariseAttendance([], enrolmentRows, dates)
    const summary = result.classes[0]
    expect(summary.possible).toBeGreaterThan(0)
    expect(summary.present).toBe(0)
    expect(summary.firstRecordedAt).toBeNull()
    expect(summary.lastUpdatedAt).toBeNull()
  })

  it('counts a marked student with no enrolment towards possible on the marked date', () => {
    const attendanceRows = [attendance({ class: classA, studentId: 'alice' })]
    const result = summariseAttendance(attendanceRows, [], dates)
    expect(result.classes).toHaveLength(1)
    expect(result.classes[0].possible).toBe(1)
    expect(result.classes[0].present).toBe(1)
    expect(result.byDate['2026-09-01'].distinctEnrolled).toBe(1)
  })

  it('never reports more present than possible for a student marked then moved the same day', () => {
    // Marked present on 09-02, then moved out that day (endDate exclusive).
    const attendanceRows = [
      attendance({ class: classA, studentId: 'mover', date: '2026-09-02' }),
    ]
    const enrolmentRows = [
      enrolment({
        class: classA,
        studentId: 'mover',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
      }),
    ]
    const result = summariseAttendance(attendanceRows, enrolmentRows, dates)
    const alpha = result.classes[0]
    expect(alpha.possible).toBe(2)
    expect(alpha.present).toBe(1)
    expect(result.byDate['2026-09-02'].distinctPresent).toBe(1)
    expect(result.byDate['2026-09-02'].distinctEnrolled).toBe(1)
  })

  it('counts a student once per class and date even with overlapping stays', () => {
    const enrolmentRows = [
      enrolment({ class: classA, studentId: 'alice', endDate: '2026-09-03' }),
      enrolment({
        class: classA,
        studentId: 'alice',
        startDate: '2026-09-02',
      }),
    ]
    const result = summariseAttendance([], enrolmentRows, dates)
    expect(result.classes[0].possible).toBe(3)
    expect(result.classes[0].enrolled).toBe(1)
  })

  it('returns no byDate entries for an empty date list', () => {
    const result = summariseAttendance([], [], [])
    expect(result.byDate).toEqual({})
  })

  it('only counts attendance rows whose date is in the requested range', () => {
    const attendanceRows = [
      attendance({
        class: classA,
        studentId: 'alice',
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

  it('lists classes in school order, then by year code', () => {
    const named = (
      id: string,
      name: string,
      yearCode: string,
    ): SummaryClass => ({
      id,
      name,
      yearGroup: '',
      yearCode,
      active: true,
    })
    const classes = [
      named('g', 'GCSE I', '2026-27'),
      named('y1new', 'Year 1', '2026-27'),
      named('n', 'Nursery', '2026-27'),
      named('y1old', 'Year 1', '2025-26'),
    ]
    const enrolmentRows = classes.map((cls) =>
      enrolment({ class: cls, studentId: cls.id }),
    )

    const result = summariseAttendance([], enrolmentRows, ['2026-09-01'])

    expect(result.classes.map((c) => c.class.id)).toEqual([
      'n',
      'y1old',
      'y1new',
      'g',
    ])
  })

  it('sorts a class whose name is not a stage by its year group', () => {
    const cls = (
      id: string,
      name: string,
      yearGroup: string,
    ): SummaryClass => ({
      id,
      name,
      yearGroup,
      yearCode: '2026-27',
      active: true,
    })
    const classes = [
      cls('alevel', 'A Level', 'A Level'),
      cls('alpha', 'Alpha', '1'),
      cls('gcse', 'GCSE I', 'GCSE'),
    ]
    const enrolmentRows = classes.map((c) =>
      enrolment({ class: c, studentId: c.id }),
    )

    const result = summariseAttendance([], enrolmentRows, ['2026-09-01'])

    expect(result.classes.map((c) => c.class.id)).toEqual([
      'alpha',
      'gcse',
      'alevel',
    ])
  })
})
