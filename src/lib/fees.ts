// Pure fee-status rules. See plans/finance-payments.md §3 and
// plans/academic-years.md §3.
// Dates are ISO `YYYY-MM-DD` strings, so they compare correctly as strings.

export type PaymentPlan = 'monthly' | 'termly' | 'yearly' | 'custom'

export type FeeStatus = 'no_plan' | 'paid_in_full' | 'up_to_date' | 'behind'

export type FeePlanAmounts = {
  academic_year: { code: string; start_date: string; end_date: string }
  full_year_amount: number
  monthly_instalment_amount: number
  termly_instalment_amount: number
}

export const PAYMENT_PLAN_LABELS: Record<PaymentPlan, string> = {
  monthly: 'Monthly',
  termly: 'Termly',
  yearly: 'Yearly',
  custom: 'Custom',
}

export type PaymentMethod = 'bank_transfer' | 'cash' | 'card' | 'other'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  other: 'Other',
}

export const FEE_STATUS_LABELS: Record<FeeStatus, string> = {
  no_plan: 'No plan',
  paid_in_full: 'Paid in full',
  up_to_date: 'Up to date',
  behind: 'Behind',
}

const MONTHLY_DUE = ['09', '10', '11', '12', '01', '02', '03', '04']
const TERMLY_DUE = ['09', '01', '04']

function roundPennies(amount: number): number {
  return Math.round(amount * 100) / 100
}

function monthsToDates(months: string[], year: number): string[] {
  // Autumn months fall in the start year, spring months in the next.
  return months.map((m) => `${Number(m) >= 9 ? year : year + 1}-${m}-01`)
}

/** Due dates within an academic year, given the year's start_date. */
export function dueDates(plan: PaymentPlan, startDate: string): string[] {
  const year = Number(startDate.slice(0, 4))
  switch (plan) {
    case 'monthly':
      return monthsToDates(MONTHLY_DUE, year)
    case 'termly':
      return monthsToDates(TERMLY_DUE, year)
    case 'yearly':
      return [startDate]
    case 'custom':
      return []
  }
}

export function instalmentAmount(
  plan: Exclude<PaymentPlan, 'custom'>,
  feePlan: FeePlanAmounts,
): number {
  switch (plan) {
    case 'monthly':
      return feePlan.monthly_instalment_amount
    case 'termly':
      return feePlan.termly_instalment_amount
    case 'yearly':
      return feePlan.full_year_amount
  }
}

/**
 * Instalments due on or before today, capped at the year total. Once every
 * due date has passed the whole year is due, so rounded instalments (e.g.
 * 3 × £266.67) never leave a family a penny short or over.
 */
export function amountDueToDate(
  plan: Exclude<PaymentPlan, 'custom'>,
  feePlan: FeePlanAmounts,
  today: string,
): number {
  const dates = dueDates(plan, feePlan.academic_year.start_date)
  const count = dates.filter((d) => d <= today).length
  if (count === 0) return 0
  if (count === dates.length) return feePlan.full_year_amount
  return roundPennies(
    Math.min(instalmentAmount(plan, feePlan) * count, feePlan.full_year_amount),
  )
}

export function sumPayments(payments: { amount: number }[]): number {
  return roundPennies(payments.reduce((sum, p) => sum + Number(p.amount), 0))
}

export type FeeStatusInput = {
  paymentPlan: PaymentPlan | null
  feePlan: FeePlanAmounts | null
  customTotal: number | null
  customUpToDate: boolean
  paid: number
  today: string
}

export type FeeStatusResult = {
  status: FeeStatus
  /** Amount expected by today; null when not computable (custom / no plan). */
  due: number | null
  /** Amount for the whole year; null when unknown. */
  total: number | null
}

export function feeStatus({
  paymentPlan,
  feePlan,
  customTotal,
  customUpToDate,
  paid,
  today,
}: FeeStatusInput): FeeStatusResult {
  if (!paymentPlan) return { status: 'no_plan', due: null, total: null }

  if (paymentPlan === 'custom') {
    if (customTotal !== null && customTotal > 0 && paid >= customTotal) {
      return { status: 'paid_in_full', due: null, total: customTotal }
    }
    return {
      status: customUpToDate ? 'up_to_date' : 'behind',
      due: null,
      total: customTotal,
    }
  }

  if (!feePlan) return { status: 'no_plan', due: null, total: null }

  const total = feePlan.full_year_amount
  const due = amountDueToDate(paymentPlan, feePlan, today)
  if (total > 0 && paid >= total) return { status: 'paid_in_full', due, total }
  return { status: paid >= due ? 'up_to_date' : 'behind', due, total }
}

export type ResolvedFeePlan<T> =
  | { kind: 'override'; plan: T }
  | { kind: 'class'; plan: T }
  | { kind: 'conflict'; plans: T[] }
  | { kind: 'none' }

/** Override wins; otherwise the single distinct plan across the student's classes. */
export function resolveFeePlan<T extends { id: string }>(
  override: T | null,
  classPlans: T[],
): ResolvedFeePlan<T> {
  if (override) return { kind: 'override', plan: override }
  const distinct = [...new Map(classPlans.map((p) => [p.id, p])).values()]
  if (distinct.length === 0) return { kind: 'none' }
  if (distinct.length === 1) return { kind: 'class', plan: distinct[0] }
  return { kind: 'conflict', plans: distinct }
}

export function resolvedPlanOrNull<T>(resolved: ResolvedFeePlan<T>): T | null {
  return resolved.kind === 'override' || resolved.kind === 'class'
    ? resolved.plan
    : null
}

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
})

export function formatGbp(amount: number): string {
  return gbp.format(amount)
}
