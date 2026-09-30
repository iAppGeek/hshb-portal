import { describe, it, expect } from 'vitest'

import {
  buildRegisterRoster,
  feeClassesForYear,
  isEnrolledOn,
  type EnrolmentRow,
} from './enrolment'

describe('isEnrolledOn', () => {
  it('is true when the date is within an open row', () => {
    expect(
      isEnrolledOn({ startDate: '2026-09-01', endDate: null }, '2026-10-01'),
    ).toBe(true)
  })

  it('treats endDate as exclusive', () => {
    const row = { startDate: '2026-09-01', endDate: '2026-10-01' }
    expect(isEnrolledOn(row, '2026-09-30')).toBe(true)
    expect(isEnrolledOn(row, '2026-10-01')).toBe(false)
  })

  it('is false before startDate', () => {
    expect(
      isEnrolledOn({ startDate: '2026-09-01', endDate: null }, '2026-08-31'),
    ).toBe(false)
  })

  it('a zero-length row is never enrolled', () => {
    const row = { startDate: '2026-09-01', endDate: '2026-09-01' }
    expect(isEnrolledOn(row, '2026-09-01')).toBe(false)
  })

  it('handles A→B→A moves across dates', () => {
    const rows: EnrolmentRow[] = [
      {
        classId: 'A',
        studentId: 's1',
        startDate: '2026-09-01',
        endDate: '2026-10-01',
      },
      {
        classId: 'A',
        studentId: 's1',
        startDate: '2026-11-01',
        endDate: null,
      },
    ]
    expect(isEnrolledOn(rows[0], '2026-09-15')).toBe(true)
    expect(isEnrolledOn(rows[0], '2026-10-15')).toBe(false)
    expect(isEnrolledOn(rows[1], '2026-10-15')).toBe(false)
    expect(isEnrolledOn(rows[1], '2026-11-15')).toBe(true)
  })
})

describe('buildRegisterRoster', () => {
  const date = '2026-09-15'

  it('includes a leaver with a mark, and a same-day joiner on a taken register', () => {
    const enrolments: EnrolmentRow[] = [
      {
        classId: 'c1',
        studentId: 'joiner',
        startDate: date,
        endDate: null,
      },
    ]
    const roster = buildRegisterRoster(['leaver', 'joiner'], enrolments, date)
    expect(roster).toEqual(['joiner', 'leaver'])
  })

  it('excludes a later joiner and an earlier leaver without a mark', () => {
    const enrolments: EnrolmentRow[] = [
      {
        classId: 'c1',
        studentId: 'later-joiner',
        startDate: '2026-09-20',
        endDate: null,
      },
      {
        classId: 'c1',
        studentId: 'earlier-leaver',
        startDate: '2026-08-01',
        endDate: '2026-09-10',
      },
      {
        classId: 'c1',
        studentId: 'current',
        startDate: '2026-09-01',
        endDate: null,
      },
    ]
    expect(buildRegisterRoster([], enrolments, date)).toEqual(['current'])
  })

  it('removes duplicates and returns a sorted list', () => {
    const enrolments: EnrolmentRow[] = [
      {
        classId: 'c1',
        studentId: 'b',
        startDate: '2026-09-01',
        endDate: null,
      },
      {
        classId: 'c1',
        studentId: 'a',
        startDate: '2026-09-01',
        endDate: null,
      },
    ]
    expect(buildRegisterRoster(['a'], enrolments, date)).toEqual(['a', 'b'])
  })
})

describe('feeClassesForYear', () => {
  it('returns [] for an empty list', () => {
    expect(feeClassesForYear([])).toEqual([])
  })

  it('returns open rows for a mid-year move to a new class', () => {
    const rows = [
      { id: 'old', startDate: '2026-09-01', endDate: '2026-11-01' },
      { id: 'new', startDate: '2026-11-01', endDate: null },
    ]
    expect(feeClassesForYear(rows)).toEqual([rows[1]])
  })

  it('returns both open rows for a leaver closed the same day in two classes', () => {
    const rows = [
      { id: 'a', startDate: '2026-09-01', endDate: '2027-01-10' },
      { id: 'b', startDate: '2026-09-01', endDate: '2027-01-10' },
    ]
    expect(feeClassesForYear(rows)).toEqual(rows)
  })

  it('ignores a zero-length stay even when it ended last', () => {
    const rows = [
      { id: 'real', startDate: '2026-09-01', endDate: '2027-01-10' },
      { id: 'mistake', startDate: '2027-01-12', endDate: '2027-01-12' },
    ]
    expect(feeClassesForYear(rows)).toEqual([rows[0]])
  })

  it('returns [] when every stay is zero-length', () => {
    expect(
      feeClassesForYear([
        { id: 'a', startDate: '2027-01-12', endDate: '2027-01-12' },
      ]),
    ).toEqual([])
  })

  it('returns the rows with the latest endDate when all are closed with different dates', () => {
    const rows = [
      { id: 'a', startDate: '2025-09-01', endDate: '2025-12-01' },
      { id: 'b', startDate: '2025-12-01', endDate: '2026-08-31' },
    ]
    expect(feeClassesForYear(rows)).toEqual([rows[1]])
  })
})
