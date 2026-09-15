import { describe, it, expect } from 'vitest'

import { canTakeRegister, isClassCompleted } from './classes'

const currentYear = { id: 'y2', start_date: '2026-09-01' }
const years = [
  { id: 'y1', start_date: '2025-09-01' },
  { id: 'y2', start_date: '2026-09-01' },
  { id: 'y3', start_date: '2027-09-01' },
]

describe('isClassCompleted', () => {
  it('is true for an inactive class', () => {
    expect(
      isClassCompleted(
        { active: false, academic_year_id: 'y2' },
        years,
        currentYear,
      ),
    ).toBe(true)
  })

  it('is true for a class from a past year', () => {
    expect(
      isClassCompleted(
        { active: true, academic_year_id: 'y1' },
        years,
        currentYear,
      ),
    ).toBe(true)
  })

  it('is false for an active current-year class', () => {
    expect(
      isClassCompleted(
        { active: true, academic_year_id: 'y2' },
        years,
        currentYear,
      ),
    ).toBe(false)
  })

  it('is false for an active future-year class', () => {
    expect(
      isClassCompleted(
        { active: true, academic_year_id: 'y3' },
        years,
        currentYear,
      ),
    ).toBe(false)
  })

  it('treats an unknown year as completed', () => {
    expect(
      isClassCompleted(
        { active: true, academic_year_id: 'missing' },
        years,
        currentYear,
      ),
    ).toBe(true)
  })
})

describe('canTakeRegister', () => {
  it('is true for an active class in the current year', () => {
    expect(
      canTakeRegister({ active: true, academic_year_id: 'y2' }, { id: 'y2' }),
    ).toBe(true)
  })

  it('is false for an inactive current-year class', () => {
    expect(
      canTakeRegister({ active: false, academic_year_id: 'y2' }, { id: 'y2' }),
    ).toBe(false)
  })

  it('is false for an active class in a different year', () => {
    expect(
      canTakeRegister({ active: true, academic_year_id: 'y3' }, { id: 'y2' }),
    ).toBe(false)
  })
})
