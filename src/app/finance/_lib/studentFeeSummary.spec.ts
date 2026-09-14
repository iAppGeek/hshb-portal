import { describe, it, expect } from 'vitest'

import type { FeePlanWithClasses, StudentFeeAccountRow } from '@/db'

import { buildStudentFeeRows, summariseStudentFees } from './studentFeeSummary'

const YEAR = {
  id: 'year-1',
  code: '2025-26',
  start_date: '2025-09-01',
  end_date: '2026-08-31',
}

function makePlan(overrides: Partial<FeePlanWithClasses>): FeePlanWithClasses {
  return {
    id: 'plan-a',
    name: 'Standard',
    academic_year: YEAR,
    full_year_amount: 800,
    monthly_instalment_amount: 100,
    termly_instalment_amount: 266.67,
    notes: null,
    active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    class_ids: ['c1'],
    ...overrides,
  }
}

function makeAccount(
  overrides: Partial<StudentFeeAccountRow>,
): StudentFeeAccountRow {
  return {
    id: 'acc-1',
    student_id: 's1',
    academic_year_id: YEAR.id,
    payment_plan: 'monthly',
    payment_plan_notes: null,
    fee_plan_override_id: null,
    custom_total_amount: null,
    custom_up_to_date: false,
    settled: false,
    settled_note: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

const alpha = { id: 'c1', name: 'Alpha' }
const beta = { id: 'c2', name: 'Beta' }
const today = '2025-10-15'

describe('summariseStudentFees', () => {
  it('resolves the plan from the student classes and counts payments', () => {
    const plan = makePlan({})
    const summary = summariseStudentFees(
      {
        classes: [alpha],
        account: makeAccount({}),
        payments: [{ amount: 100, payment_date: '2025-09-01' }],
      },
      [plan],
      today,
    )

    expect(summary.resolution).toEqual({ kind: 'class', plan })
    expect(summary.paid).toBe(100)
    expect(summary.due).toBe(200)
    expect(summary.status).toBe('behind')
  })

  it('ignores inactive plans attached to classes', () => {
    const summary = summariseStudentFees(
      { classes: [alpha], account: makeAccount({}), payments: [] },
      [makePlan({ active: false })],
      today,
    )
    expect(summary.resolution.kind).toBe('none')
    expect(summary.status).toBe('no_plan')
  })

  it('uses an override even when it is inactive', () => {
    const override = makePlan({ id: 'plan-o', active: false, class_ids: [] })
    const summary = summariseStudentFees(
      {
        classes: [alpha],
        account: makeAccount({ fee_plan_override_id: 'plan-o' }),
        payments: [],
      },
      [makePlan({}), override],
      today,
    )
    expect(summary.resolution).toEqual({ kind: 'override', plan: override })
  })

  it('flags a conflict when classes map to different plans', () => {
    const summary = summariseStudentFees(
      { classes: [alpha, beta], account: makeAccount({}), payments: [] },
      [makePlan({}), makePlan({ id: 'plan-b', class_ids: ['c2'] })],
      today,
    )
    expect(summary.resolution.kind).toBe('conflict')
    expect(summary.feePlan).toBeNull()
    expect(summary.status).toBe('no_plan')
  })

  it('handles a student with no fee account', () => {
    const summary = summariseStudentFees(
      { classes: [], account: null, payments: [] },
      [],
      today,
    )
    expect(summary.paymentPlan).toBeNull()
    expect(summary.status).toBe('no_plan')
  })

  it('passes custom plan details through', () => {
    const summary = summariseStudentFees(
      {
        classes: [],
        account: makeAccount({
          payment_plan: 'custom',
          custom_total_amount: 300,
          custom_up_to_date: true,
        }),
        payments: [{ amount: 50, payment_date: '2025-09-15' }],
      },
      [],
      today,
    )
    expect(summary.status).toBe('up_to_date')
    expect(summary.total).toBe(300)
    expect(summary.paid).toBe(50)
  })
})

describe('buildStudentFeeRows', () => {
  it('maps students to table rows, including any prior-year balance', () => {
    const rows = buildStudentFeeRows(
      [
        {
          id: 's1',
          first_name: 'Alice',
          last_name: 'Student',
          student_code: 'A1',
          classes: [alpha],
          account: makeAccount({}),
          payments: [{ amount: 200, payment_date: '2025-09-10' }],
        },
        {
          id: 's2',
          first_name: 'Bob',
          last_name: 'Student',
          student_code: null,
          classes: [alpha, beta],
          account: null,
          payments: [],
        },
      ],
      [makePlan({}), makePlan({ id: 'plan-b', class_ids: ['c2'] })],
      today,
      { s1: 150 },
    )

    expect(rows).toEqual([
      {
        id: 's1',
        name: 'Student, Alice',
        studentCode: 'A1',
        classes: [alpha],
        paymentPlan: 'monthly',
        feePlanName: 'Standard (2025-26)',
        conflict: false,
        paid: 200,
        due: 200,
        status: 'up_to_date',
        priorOwed: 150,
      },
      {
        id: 's2',
        name: 'Student, Bob',
        studentCode: null,
        classes: [alpha, beta],
        paymentPlan: null,
        feePlanName: null,
        conflict: true,
        paid: 0,
        due: null,
        status: 'no_plan',
        priorOwed: 0,
      },
    ])
  })
})
