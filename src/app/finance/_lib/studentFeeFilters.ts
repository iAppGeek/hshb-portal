import type { FeeStatus, PaymentPlan } from '@/lib/fees'

import type { StudentFeeRow } from './studentFeeSummary'

export type PlanFilter = '' | PaymentPlan | 'none'
export type StatusFilter = '' | FeeStatus | 'conflict' | 'owes_prior'

export function matchesPlanFilter(
  row: StudentFeeRow,
  plan: PlanFilter,
): boolean {
  if (plan === '') return true
  if (plan === 'none') return row.paymentPlan === null
  return row.paymentPlan === plan
}

export function matchesStatusFilter(
  row: StudentFeeRow,
  status: StatusFilter,
): boolean {
  if (status === '') return true
  if (status === 'conflict') return row.conflict
  if (status === 'owes_prior') return row.priorOwed > 0
  return row.status === status
}
