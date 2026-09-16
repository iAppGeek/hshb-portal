import { describe, it, expect } from 'vitest'

import {
  normaliseQuery,
  matchesAny,
  digitsOnly,
  isPhoneShapedQuery,
  fullName,
} from './search'

describe('normaliseQuery', () => {
  it('lowercases and trims', () => {
    expect(normaliseQuery('  Gary  ')).toBe('gary')
  })
})

describe('matchesAny', () => {
  it('matches when any haystack contains the query, case-insensitively', () => {
    expect(matchesAny(['AliceGuardian, Gary', ''], 'gary')).toBe(true)
  })

  it('does not match when no haystack contains the query', () => {
    expect(
      matchesAny(['AliceGuardian, Gary', 'gary.alice@example.com'], 'nobody'),
    ).toBe(false)
  })
})

describe('digitsOnly', () => {
  it('strips non-digit characters', () => {
    expect(digitsOnly('07700 900003')).toBe('07700900003')
    expect(digitsOnly('+44 (0)7700')).toBe('4407700')
  })
})

describe('isPhoneShapedQuery', () => {
  it('is true for a plain digit string with 3+ digits', () => {
    expect(isPhoneShapedQuery('07711000002')).toBe(true)
  })

  it('matches formatting-agnostically (digits + phone punctuation)', () => {
    expect(isPhoneShapedQuery('07700 900003')).toBe(true)
    expect(isPhoneShapedQuery('+44 7700 900003')).toBe(true)
  })

  it('is false for a non-digit query so it does not match every phone', () => {
    expect(isPhoneShapedQuery('nobody')).toBe(false)
  })

  it('is false for a short digit-only query like "3"', () => {
    expect(isPhoneShapedQuery('3')).toBe(false)
  })

  it('is false for a mixed letters+digits query like "smith1"', () => {
    expect(isPhoneShapedQuery('smith1')).toBe(false)
  })

  it('is true for a short phone-shaped fragment like "00002"', () => {
    expect(isPhoneShapedQuery('00002')).toBe(true)
  })
})

describe('fullName', () => {
  it('matches "First Last" ordering', () => {
    expect(fullName('Gary', 'AliceGuardian')).toContain('Gary AliceGuardian')
  })

  it('matches "Last, First" ordering', () => {
    expect(fullName('Gary', 'AliceGuardian')).toContain('AliceGuardian, Gary')
  })
})
