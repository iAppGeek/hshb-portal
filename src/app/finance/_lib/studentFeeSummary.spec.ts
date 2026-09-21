import { describe, it, expect } from 'vitest'

import type {
  AcademicYearRow,
  FeePlanWithClasses,
  StudentFeeAccountRow,
  StudentFeeYear,
} from '@/db'

import {
  addPaymentToHistory,
  buildStudentFeeRows,
  feePlanOptions,
  sortPaymentsNewestFirst,
  summariseOtherYears,
  summariseStudentFees,
} from './studentFeeSummary'

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

  it('counts inactive plans attached to classes', () => {
    const plan = makePlan({ active: false })
    const summary = summariseStudentFees(
      { classes: [alpha], account: makeAccount({}), payments: [] },
      [plan],
      today,
    )
    expect(summary.resolution).toEqual({ kind: 'class', plan })
    expect(summary.total).toBe(800)
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
          active: true,
          leaving_reason: null,
          classes: [alpha],
          account: makeAccount({}),
          payments: [{ amount: 200, payment_date: '2025-09-10' }],
        },
        {
          id: 's2',
          first_name: 'Bob',
          last_name: 'Student',
          student_code: null,
          active: false,
          leaving_reason: 'transferred',
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
        active: true,
        leavingReason: null,
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
        active: false,
        leavingReason: 'transferred',
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

function makeYear(id: string, code: string, start: string): AcademicYearRow {
  return {
    id,
    code,
    start_date: start,
    end_date: `${Number(start.slice(0, 4)) + 1}-08-31`,
    is_current: false,
    created_at: '2025-01-01T00:00:00Z',
  } as AcademicYearRow
}

const PRIOR = makeYear('year-0', '2024-25', '2024-09-01')
const CURRENT = makeYear(YEAR.id, YEAR.code, YEAR.start_date)
const OLDER = makeYear('year-old', '2023-24', '2023-09-01')

describe('feePlanOptions', () => {
  it('lists active plans plus an inactive plan the account overrides to', () => {
    const active = makePlan({ id: 'p-active', name: 'Standard' })
    const retired = makePlan({ id: 'p-retired', name: 'Old', active: false })
    const other = makePlan({ id: 'p-other', name: 'Gone', active: false })
    const plans = [active, retired, other]

    expect(feePlanOptions(plans, null)).toEqual([
      { id: 'p-active', label: 'Standard (2025-26)' },
    ])
    expect(
      feePlanOptions(plans, makeAccount({ fee_plan_override_id: 'p-retired' })),
    ).toEqual([
      { id: 'p-active', label: 'Standard (2025-26)' },
      { id: 'p-retired', label: 'Old (2025-26)' },
    ])
  })
})

describe('summariseOtherYears', () => {
  const priorPlan = makePlan({
    id: 'p-prior',
    academic_year: PRIOR,
    full_year_amount: 800,
  })

  it('summarises every year except the one on screen', () => {
    const history: StudentFeeYear[] = [
      { year: CURRENT, classes: [alpha], account: null, payments: [] },
      {
        year: PRIOR,
        classes: [alpha],
        account: makeAccount({ academic_year_id: PRIOR.id, settled: true }),
        payments: [{ amount: 300, payment_date: '2024-10-01' }],
      },
    ]

    expect(
      summariseOtherYears(
        history,
        { [PRIOR.id]: [priorPlan] },
        CURRENT.id,
        today,
      ),
    ).toEqual([
      { year: PRIOR, paid: 300, total: 800, balance: 500, settled: true },
    ])
  })

  it('shows no total or balance for a year with no plan', () => {
    const history: StudentFeeYear[] = [
      {
        year: PRIOR,
        classes: [],
        account: null,
        payments: [{ amount: 20, payment_date: '2024-10-01' }],
      },
    ]

    expect(summariseOtherYears(history, {}, CURRENT.id, today)).toEqual([
      { year: PRIOR, paid: 20, total: null, balance: null, settled: false },
    ])
  })

  it('never shows a negative balance once overpaid', () => {
    const history: StudentFeeYear[] = [
      {
        year: PRIOR,
        classes: [alpha],
        account: makeAccount({ academic_year_id: PRIOR.id }),
        payments: [{ amount: 900, payment_date: '2024-10-01' }],
      },
    ]

    const [row] = summariseOtherYears(
      history,
      { [PRIOR.id]: [priorPlan] },
      CURRENT.id,
      today,
    )
    expect(row.balance).toBe(0)
  })
})

describe('addPaymentToHistory', () => {
  const payment = { amount: 50, payment_date: '2024-11-01' }

  it("adds the payment to that year's existing entry", () => {
    const history: StudentFeeYear[] = [
      {
        year: PRIOR,
        classes: [alpha],
        account: null,
        payments: [{ amount: 10, payment_date: '2024-10-01' }],
      },
    ]

    expect(addPaymentToHistory(history, PRIOR, payment)[0].payments).toEqual([
      { amount: 10, payment_date: '2024-10-01' },
      payment,
    ])
  })

  it('starts a new entry, newest year first, when the year had nothing', () => {
    const history: StudentFeeYear[] = [
      { year: CURRENT, classes: [alpha], account: null, payments: [] },
      { year: OLDER, classes: [], account: null, payments: [] },
    ]

    const result = addPaymentToHistory(history, PRIOR, payment)

    expect(result.map((yh) => yh.year.id)).toEqual([
      CURRENT.id,
      PRIOR.id,
      OLDER.id,
    ])
    expect(result[1]).toEqual({
      year: PRIOR,
      classes: [],
      account: null,
      payments: [payment],
    })
  })

  it('does not change the history it was given', () => {
    const history: StudentFeeYear[] = [
      { year: PRIOR, classes: [], account: null, payments: [] },
    ]
    addPaymentToHistory(history, PRIOR, payment)
    expect(history[0].payments).toEqual([])
  })
})

describe('sortPaymentsNewestFirst', () => {
  it('orders by payment date, then by when it was recorded', () => {
    const a = {
      id: 'a',
      payment_date: '2025-10-01',
      created_at: '2025-10-01T09:00:00Z',
    }
    const b = {
      id: 'b',
      payment_date: '2025-10-02',
      created_at: '2025-10-02T09:00:00Z',
    }
    const c = {
      id: 'c',
      payment_date: '2025-10-01',
      created_at: '2025-10-03T09:00:00Z',
    }

    expect(sortPaymentsNewestFirst([a, b, c]).map((p) => p.id)).toEqual([
      'b',
      'c',
      'a',
    ])
  })
})
