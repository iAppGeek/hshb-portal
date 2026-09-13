import { describe, it, expect } from 'vitest'

import {
  addDays,
  addYears,
  expiryState,
  EXPIRY_WARNING_DAYS,
  DBS_RENEWAL_YEARS,
  labelFor,
  maskLastFour,
  PAYMENT_FUNDING_LABELS,
} from './compliance'

describe('addDays', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02')
  })

  it('subtracts days with a negative count', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('addYears', () => {
  it('adds whole years', () => {
    expect(addYears('2025-09-13', DBS_RENEWAL_YEARS)).toBe('2028-09-13')
  })

  it('rolls 29 Feb back to 28 Feb in a non-leap year', () => {
    expect(addYears('2024-02-29', 3)).toBe('2027-02-28')
  })

  it('keeps 29 Feb in a leap year', () => {
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29')
  })
})

describe('expiryState', () => {
  const today = '2026-09-13'

  it('returns null when there is no expiry date', () => {
    expect(expiryState(null, today)).toBeNull()
  })

  it('is expired when the date is before today', () => {
    expect(expiryState('2026-09-12', today)).toBe('expired')
  })

  it('is expiring on the day itself', () => {
    expect(expiryState(today, today)).toBe('expiring')
  })

  it('is expiring within the warning window', () => {
    expect(expiryState(addDays(today, EXPIRY_WARNING_DAYS), today)).toBe(
      'expiring',
    )
  })

  it('is ok beyond the warning window', () => {
    expect(expiryState(addDays(today, EXPIRY_WARNING_DAYS + 1), today)).toBe(
      'ok',
    )
  })

  it('honours a custom warning window', () => {
    expect(expiryState('2026-09-20', today, 5)).toBe('ok')
  })
})

describe('labelFor', () => {
  it('returns the label for a known value', () => {
    expect(labelFor(PAYMENT_FUNDING_LABELS, 'kea')).toBe('KEA')
  })

  it('returns a dash for null or unknown values', () => {
    expect(labelFor(PAYMENT_FUNDING_LABELS, null)).toBe('—')
    expect(labelFor(PAYMENT_FUNDING_LABELS, 'grant')).toBe('—')
  })
})

describe('maskLastFour', () => {
  it('shows only the last four characters', () => {
    expect(maskLastFour('12345678')).toBe('••••5678')
  })

  it('returns null when there is no value', () => {
    expect(maskLastFour(null)).toBeNull()
    expect(maskLastFour('')).toBeNull()
  })
})
