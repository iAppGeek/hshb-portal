import { describe, it, expect } from 'vitest'

import { BANK_DETAIL_FIELDS, redactChanges } from './audit-redaction'

describe('redactChanges', () => {
  const next = {
    payment_funding: 'school',
    bank_account_name: 'A Person',
    bank_sort_code: '123456',
    bank_account_number: '12345678',
  }

  it('marks every present field as changed when there is no previous record', () => {
    expect(redactChanges(next, null, BANK_DETAIL_FIELDS)).toEqual({
      payment_funding: 'school',
      bank_account_name: '[changed]',
      bank_sort_code: '[changed]',
      bank_account_number: '[changed]',
    })
  })

  it('distinguishes changed from unchanged values', () => {
    const previous = { ...next, bank_sort_code: '654321' }
    expect(redactChanges(next, previous, BANK_DETAIL_FIELDS)).toMatchObject({
      bank_account_name: '[unchanged]',
      bank_sort_code: '[changed]',
      bank_account_number: '[unchanged]',
    })
  })

  it('treats null and missing as the same empty value', () => {
    const cleared = { bank_sort_code: null }
    expect(redactChanges(cleared, {}, ['bank_sort_code'])).toEqual({
      bank_sort_code: '[unchanged]',
    })
  })

  it('does not add fields that were not submitted', () => {
    expect(redactChanges({ a: 1 }, null, BANK_DETAIL_FIELDS)).toEqual({ a: 1 })
  })

  it('never leaks the raw values', () => {
    const json = JSON.stringify(redactChanges(next, null, BANK_DETAIL_FIELDS))
    expect(json).not.toContain('12345678')
    expect(json).not.toContain('123456')
  })
})
