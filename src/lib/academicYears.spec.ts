import { describe, it, expect } from 'vitest'

import {
  academicYearForDate,
  nextAcademicYear,
  normaliseAcademicYear,
} from './academicYears'

describe('normaliseAcademicYear', () => {
  it('converts a slash to a dash and trims', () => {
    expect(normaliseAcademicYear(' 2025/26 ')).toBe('2025-26')
  })

  it('leaves the dash form unchanged', () => {
    expect(normaliseAcademicYear('2025-26')).toBe('2025-26')
  })
})

describe('nextAcademicYear', () => {
  it('returns the year immediately after the given code', () => {
    expect(nextAcademicYear('2025-26')).toEqual({
      code: '2026-27',
      start_date: '2026-09-01',
      end_date: '2027-08-31',
    })
  })

  it('accepts the slash form', () => {
    expect(nextAcademicYear('2026/27')).toEqual({
      code: '2027-28',
      start_date: '2027-09-01',
      end_date: '2028-08-31',
    })
  })
})

describe('academicYearForDate', () => {
  const years = [
    { code: '2025-26', start_date: '2025-09-01', end_date: '2026-08-31' },
    { code: '2026-27', start_date: '2026-09-01', end_date: '2027-08-31' },
  ]

  it('finds the year whose inclusive range contains the date', () => {
    expect(academicYearForDate(years, '2026-01-15')?.code).toBe('2025-26')
    expect(academicYearForDate(years, '2025-09-01')?.code).toBe('2025-26')
    expect(academicYearForDate(years, '2026-08-31')?.code).toBe('2025-26')
  })

  it('returns null when no year contains the date', () => {
    expect(academicYearForDate(years, '2024-01-01')).toBeNull()
  })
})
