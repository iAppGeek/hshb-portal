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
      isEnrolledOn({ start_date: '2026-09-01', end_date: null }, '2026-10-01'),
    ).toBe(true)
  })

  it('treats end_date as exclusive', () => {
    const row = { start_date: '2026-09-01', end_date: '2026-10-01' }
    expect(isEnrolledOn(row, '2026-09-30')).toBe(true)
    expect(isEnrolledOn(row, '2026-10-01')).toBe(false)
  })

  it('is false before start_date', () => {
    expect(
      isEnrolledOn({ start_date: '2026-09-01', end_date: null }, '2026-08-31'),
    ).toBe(false)
  })

  it('a zero-length row is never enrolled', () => {
    const row = { start_date: '2026-09-01', end_date: '2026-09-01' }
    expect(isEnrolledOn(row, '2026-09-01')).toBe(false)
  })

  it('handles A→B→A moves across dates', () => {
    const rows: EnrolmentRow[] = [
      {
        class_id: 'A',
        student_id: 's1',
        start_date: '2026-09-01',
        end_date: '2026-10-01',
      },
      {
        class_id: 'A',
        student_id: 's1',
        start_date: '2026-11-01',
        end_date: null,
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
        class_id: 'c1',
        student_id: 'joiner',
        start_date: date,
        end_date: null,
      },
    ]
    const roster = buildRegisterRoster(['leaver', 'joiner'], enrolments, date)
    expect(roster).toEqual(['joiner', 'leaver'])
  })

  it('excludes a later joiner and an earlier leaver without a mark', () => {
    const enrolments: EnrolmentRow[] = [
      {
        class_id: 'c1',
        student_id: 'later-joiner',
        start_date: '2026-09-20',
        end_date: null,
      },
      {
        class_id: 'c1',
        student_id: 'earlier-leaver',
        start_date: '2026-08-01',
        end_date: '2026-09-10',
      },
      {
        class_id: 'c1',
        student_id: 'current',
        start_date: '2026-09-01',
        end_date: null,
      },
    ]
    expect(buildRegisterRoster([], enrolments, date)).toEqual(['current'])
  })

  it('removes duplicates and returns a sorted list', () => {
    const enrolments: EnrolmentRow[] = [
      {
        class_id: 'c1',
        student_id: 'b',
        start_date: '2026-09-01',
        end_date: null,
      },
      {
        class_id: 'c1',
        student_id: 'a',
        start_date: '2026-09-01',
        end_date: null,
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
      { id: 'old', start_date: '2026-09-01', end_date: '2026-11-01' },
      { id: 'new', start_date: '2026-11-01', end_date: null },
    ]
    expect(feeClassesForYear(rows)).toEqual([rows[1]])
  })

  it('returns both open rows for a leaver closed the same day in two classes', () => {
    const rows = [
      { id: 'a', start_date: '2026-09-01', end_date: '2027-01-10' },
      { id: 'b', start_date: '2026-09-01', end_date: '2027-01-10' },
    ]
    expect(feeClassesForYear(rows)).toEqual(rows)
  })

  it('ignores a zero-length stay even when it ended last', () => {
    const rows = [
      { id: 'real', start_date: '2026-09-01', end_date: '2027-01-10' },
      { id: 'mistake', start_date: '2027-01-12', end_date: '2027-01-12' },
    ]
    expect(feeClassesForYear(rows)).toEqual([rows[0]])
  })

  it('returns [] when every stay is zero-length', () => {
    expect(
      feeClassesForYear([
        { id: 'a', start_date: '2027-01-12', end_date: '2027-01-12' },
      ]),
    ).toEqual([])
  })

  it('returns the rows with the latest end_date when all are closed with different dates', () => {
    const rows = [
      { id: 'a', start_date: '2025-09-01', end_date: '2025-12-01' },
      { id: 'b', start_date: '2025-12-01', end_date: '2026-08-31' },
    ]
    expect(feeClassesForYear(rows)).toEqual([rows[1]])
  })
})
