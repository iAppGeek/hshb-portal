import { describe, it, expect } from 'vitest'

import {
  academicYearRange,
  academicYearStart,
  paymentsInAcademicYear,
  amountDueToDate,
  dueDates,
  feeStatus,
  formatGbp,
  instalmentAmount,
  normaliseAcademicYear,
  resolveFeePlan,
  resolvedPlanOrNull,
  sumPayments,
  type FeePlanAmounts,
} from './fees'

const plan: FeePlanAmounts = {
  academic_year: '2025-26',
  full_year_amount: 800,
  monthly_instalment_amount: 100,
  termly_instalment_amount: 266.67,
}

describe('normaliseAcademicYear', () => {
  it('converts a slash to a dash and trims', () => {
    expect(normaliseAcademicYear(' 2025/26 ')).toBe('2025-26')
  })

  it('leaves the dash form unchanged', () => {
    expect(normaliseAcademicYear('2025-26')).toBe('2025-26')
  })
})

describe('academicYearStart', () => {
  it('returns 1 September of the first year', () => {
    expect(academicYearStart('2025-26')).toBe('2025-09-01')
  })

  it('accepts the slash form', () => {
    expect(academicYearStart('2026/27')).toBe('2026-09-01')
  })

  it('returns null for an unrecognised value', () => {
    expect(academicYearStart('next year')).toBeNull()
  })
})

describe('dueDates', () => {
  it('gives 8 monthly dates from September to April', () => {
    expect(dueDates('monthly', '2025-26')).toEqual([
      '2025-09-01',
      '2025-10-01',
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ])
  })

  it('gives 3 termly dates', () => {
    expect(dueDates('termly', '2025-26')).toEqual([
      '2025-09-01',
      '2026-01-01',
      '2026-04-01',
    ])
  })

  it('gives a single yearly date', () => {
    expect(dueDates('yearly', '2025-26')).toEqual(['2025-09-01'])
  })

  it('has no schedule for custom plans', () => {
    expect(dueDates('custom', '2025-26')).toEqual([])
  })

  it('has no schedule for an invalid academic year', () => {
    expect(dueDates('monthly', 'bad')).toEqual([])
  })
})

describe('instalmentAmount', () => {
  it('picks the amount matching the payment plan', () => {
    expect(instalmentAmount('monthly', plan)).toBe(100)
    expect(instalmentAmount('termly', plan)).toBe(266.67)
    expect(instalmentAmount('yearly', plan)).toBe(800)
  })
})

describe('amountDueToDate', () => {
  it('is zero before the first due date', () => {
    expect(amountDueToDate('monthly', plan, '2025-08-31')).toBe(0)
  })

  it('counts a due date falling on today', () => {
    expect(amountDueToDate('monthly', plan, '2025-09-01')).toBe(100)
  })

  it('sums the monthly instalments due so far', () => {
    expect(amountDueToDate('monthly', plan, '2026-01-15')).toBe(500)
  })

  it('rounds termly instalments to pennies', () => {
    expect(amountDueToDate('termly', plan, '2026-02-01')).toBe(533.34)
  })

  it('is the full year once every date has passed', () => {
    expect(amountDueToDate('termly', plan, '2026-06-01')).toBe(800)
  })

  it('caps at the year total when instalments overshoot', () => {
    const generous = { ...plan, monthly_instalment_amount: 500 }
    expect(amountDueToDate('monthly', generous, '2025-10-15')).toBe(800)
  })
})

describe('sumPayments', () => {
  it('adds payments and rounds to pennies', () => {
    expect(sumPayments([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3)
  })

  it('is zero with no payments', () => {
    expect(sumPayments([])).toBe(0)
  })
})

describe('feeStatus', () => {
  const base = {
    paymentPlan: 'monthly' as const,
    feePlan: plan,
    customTotal: null,
    customUpToDate: false,
    paid: 0,
    today: '2025-10-15',
  }

  it('is no_plan without a payment plan', () => {
    expect(feeStatus({ ...base, paymentPlan: null })).toEqual({
      status: 'no_plan',
      due: null,
      total: null,
    })
  })

  it('is no_plan without a resolvable fee plan', () => {
    expect(feeStatus({ ...base, feePlan: null }).status).toBe('no_plan')
  })

  it('is behind when paid is less than due', () => {
    expect(feeStatus({ ...base, paid: 100 })).toEqual({
      status: 'behind',
      due: 200,
      total: 800,
    })
  })

  it('is up_to_date when paid covers what is due', () => {
    expect(feeStatus({ ...base, paid: 200 }).status).toBe('up_to_date')
  })

  it('is paid_in_full when paid covers the year', () => {
    expect(feeStatus({ ...base, paid: 800 }).status).toBe('paid_in_full')
  })

  it('treats a free plan as up to date rather than paid in full', () => {
    const free = {
      ...plan,
      full_year_amount: 0,
      monthly_instalment_amount: 0,
    }
    expect(feeStatus({ ...base, feePlan: free }).status).toBe('up_to_date')
  })

  describe('custom plans', () => {
    const custom = { ...base, paymentPlan: 'custom' as const, feePlan: null }

    it('follows the manual up-to-date toggle', () => {
      expect(feeStatus({ ...custom, customUpToDate: true })).toEqual({
        status: 'up_to_date',
        due: null,
        total: null,
      })
      expect(feeStatus({ ...custom, customTotal: 300 }).status).toBe('behind')
    })

    it('is paid_in_full once the agreed total is paid', () => {
      expect(feeStatus({ ...custom, customTotal: 300, paid: 300 })).toEqual({
        status: 'paid_in_full',
        due: null,
        total: 300,
      })
    })
  })
})

describe('resolveFeePlan', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }

  it('prefers the override', () => {
    expect(resolveFeePlan(b, [a])).toEqual({ kind: 'override', plan: b })
  })

  it('is none when no class has a plan', () => {
    expect(resolveFeePlan(null, [])).toEqual({ kind: 'none' })
  })

  it('uses the single plan, even when repeated across classes', () => {
    expect(resolveFeePlan(null, [a, { id: 'a' }])).toEqual({
      kind: 'class',
      plan: a,
    })
  })

  it('flags a conflict for multiple distinct plans', () => {
    expect(resolveFeePlan(null, [a, b])).toEqual({
      kind: 'conflict',
      plans: [a, b],
    })
  })
})

describe('resolvedPlanOrNull', () => {
  it('returns the plan for override and class resolutions', () => {
    expect(resolvedPlanOrNull({ kind: 'override', plan: 1 })).toBe(1)
    expect(resolvedPlanOrNull({ kind: 'class', plan: 2 })).toBe(2)
  })

  it('returns null for none and conflict', () => {
    expect(resolvedPlanOrNull({ kind: 'none' })).toBeNull()
    expect(resolvedPlanOrNull({ kind: 'conflict', plans: [1, 2] })).toBeNull()
  })
})

describe('formatGbp', () => {
  it('formats pounds and pence', () => {
    expect(formatGbp(1234.5)).toBe('£1,234.50')
  })
})

describe('academicYearRange', () => {
  it('runs from 1 September to 31 August', () => {
    expect(academicYearRange('2025-26')).toEqual({
      start: '2025-09-01',
      end: '2026-08-31',
    })
  })

  it('is null for an unrecognised value', () => {
    expect(academicYearRange('soon')).toBeNull()
  })
})

describe('paymentsInAcademicYear', () => {
  const payments = [
    { payment_date: '2025-08-31' },
    { payment_date: '2025-09-01' },
    { payment_date: '2026-08-31' },
    { payment_date: '2026-09-01' },
  ]

  it('keeps payments inside the year, inclusive of both ends', () => {
    expect(paymentsInAcademicYear(payments, '2025-26')).toEqual([
      { payment_date: '2025-09-01' },
      { payment_date: '2026-08-31' },
    ])
  })

  it('keeps every payment when the year is unknown', () => {
    expect(paymentsInAcademicYear(payments, null)).toHaveLength(4)
    expect(paymentsInAcademicYear(payments, 'bad')).toHaveLength(4)
  })
})
