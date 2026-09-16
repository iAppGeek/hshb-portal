import { describe, it, expect } from 'vitest'

import type { FeeStatus, PaymentPlan } from '@/lib/fees'

import type { StudentFeeRow } from './studentFeeSummary'
import { matchesPlanFilter, matchesStatusFilter } from './studentFeeFilters'

function makeRow(overrides: Partial<StudentFeeRow> = {}): StudentFeeRow {
  return {
    id: 's1',
    name: 'Adams, Amy',
    studentCode: 'A001',
    active: true,
    leavingReason: null,
    classes: [],
    paymentPlan: null,
    feePlanName: null,
    conflict: false,
    paid: 0,
    due: 0,
    status: 'no_plan',
    priorOwed: 0,
    ...overrides,
  }
}

describe('matchesPlanFilter', () => {
  it('matches everything for the empty filter', () => {
    expect(matchesPlanFilter(makeRow({ paymentPlan: 'monthly' }), '')).toBe(
      true,
    )
    expect(matchesPlanFilter(makeRow({ paymentPlan: null }), '')).toBe(true)
  })

  it('matches rows with no payment plan for "none"', () => {
    expect(matchesPlanFilter(makeRow({ paymentPlan: null }), 'none')).toBe(true)
    expect(matchesPlanFilter(makeRow({ paymentPlan: 'monthly' }), 'none')).toBe(
      false,
    )
  })

  const plans: PaymentPlan[] = ['monthly', 'termly', 'yearly', 'custom']
  it.each(plans)('matches rows with payment plan %s', (plan) => {
    expect(matchesPlanFilter(makeRow({ paymentPlan: plan }), plan)).toBe(true)
    const other = plans.find((p) => p !== plan)
    expect(matchesPlanFilter(makeRow({ paymentPlan: other }), plan)).toBe(false)
  })
})

describe('matchesStatusFilter', () => {
  it('matches everything for the empty filter', () => {
    expect(matchesStatusFilter(makeRow({ status: 'behind' }), '')).toBe(true)
  })

  it('matches conflicted rows for "conflict"', () => {
    expect(matchesStatusFilter(makeRow({ conflict: true }), 'conflict')).toBe(
      true,
    )
    expect(matchesStatusFilter(makeRow({ conflict: false }), 'conflict')).toBe(
      false,
    )
  })

  it('matches rows owing from prior years for "owes_prior"', () => {
    expect(matchesStatusFilter(makeRow({ priorOwed: 50 }), 'owes_prior')).toBe(
      true,
    )
    expect(matchesStatusFilter(makeRow({ priorOwed: 0 }), 'owes_prior')).toBe(
      false,
    )
  })

  const statuses: FeeStatus[] = [
    'no_plan',
    'paid_in_full',
    'up_to_date',
    'behind',
  ]
  it.each(statuses)('matches rows with status %s', (status) => {
    expect(matchesStatusFilter(makeRow({ status }), status)).toBe(true)
    const other = statuses.find((s) => s !== status)!
    expect(matchesStatusFilter(makeRow({ status: other }), status)).toBe(false)
  })
})
