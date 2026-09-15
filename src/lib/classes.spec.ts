import { describe, it, expect } from 'vitest'

import { isClassOpen } from './classes'

const currentYear = { id: 'y2' }

describe('isClassOpen', () => {
  it('is true for an active class in the current year', () => {
    expect(
      isClassOpen({ active: true, academic_year_id: 'y2' }, currentYear),
    ).toBe(true)
  })

  it('is false for an inactive current-year class', () => {
    expect(
      isClassOpen({ active: false, academic_year_id: 'y2' }, currentYear),
    ).toBe(false)
  })

  it('is false for an active class from a past year awaiting migration', () => {
    expect(
      isClassOpen({ active: true, academic_year_id: 'y1' }, currentYear),
    ).toBe(false)
  })

  it('is false for an active class in a future year', () => {
    expect(
      isClassOpen({ active: true, academic_year_id: 'y3' }, currentYear),
    ).toBe(false)
  })
})
