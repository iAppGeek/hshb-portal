import { describe, it, expect } from 'vitest'

import { compareNullableText, compareDateDesc, compareByName } from './sort'

describe('compareNullableText', () => {
  it('returns 0 for ties', () => {
    expect(compareNullableText('a', 'a')).toBe(0)
    expect(compareNullableText(null, null)).toBe(0)
  })

  it('sorts null last', () => {
    expect(compareNullableText(null, 'a')).toBe(1)
    expect(compareNullableText('a', null)).toBe(-1)
  })

  it('uses locale ordering for non-null values', () => {
    expect(compareNullableText('a', 'b')).toBeLessThan(0)
    expect(compareNullableText('b', 'a')).toBeGreaterThan(0)
  })
})

describe('compareDateDesc', () => {
  it('returns 0 for ties', () => {
    expect(compareDateDesc('2024-01-01', '2024-01-01')).toBe(0)
    expect(compareDateDesc(null, null)).toBe(0)
  })

  it('sorts null first, treating open-ended as newest', () => {
    expect(compareDateDesc(null, '2024-01-01')).toBe(-1)
    expect(compareDateDesc('2024-01-01', null)).toBe(1)
  })

  it('sorts non-null dates in descending order', () => {
    expect(compareDateDesc('2024-06-01', '2024-01-01')).toBeLessThan(0)
    expect(compareDateDesc('2024-01-01', '2024-06-01')).toBeGreaterThan(0)
  })
})

describe('compareByName', () => {
  it('sorts by last name first', () => {
    const a = { first_name: 'Zack', last_name: 'Adams' }
    const b = { first_name: 'Amy', last_name: 'Baker' }
    expect(compareByName(a, b)).toBeLessThan(0)
  })

  it('falls back to first name when last names match', () => {
    const a = { first_name: 'Amy', last_name: 'Adams' }
    const b = { first_name: 'Zack', last_name: 'Adams' }
    expect(compareByName(a, b)).toBeLessThan(0)
  })

  it('returns 0 for identical names', () => {
    const a = { first_name: 'Amy', last_name: 'Adams' }
    const b = { first_name: 'Amy', last_name: 'Adams' }
    expect(compareByName(a, b)).toBe(0)
  })
})
