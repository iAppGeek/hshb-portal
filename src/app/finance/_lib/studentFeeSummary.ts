import type {
  AcademicYearRow,
  FeeClass,
  FeePlanWithClasses,
  PaymentSummary,
  StudentFeeAccountRow,
  StudentFeeListItem,
  StudentFeeYear,
} from '@/db'
import {
  feeStatus,
  resolveFeePlan,
  resolvedPlanOrNull,
  sumPayments,
  type FeeStatus,
  type FeeStatusResult,
  type PaymentPlan,
  type ResolvedFeePlan,
} from '@/lib/fees'

import { planLabel } from './feePlanClasses'

export type StudentFeeSummary = FeeStatusResult & {
  resolution: ResolvedFeePlan<FeePlanWithClasses>
  feePlan: FeePlanWithClasses | null
  paymentPlan: PaymentPlan | null
  paid: number
}

export type StudentFeeInput = {
  classes: FeeClass[]
  account: StudentFeeAccountRow | null
  payments: PaymentSummary[]
}

export function summariseStudentFees(
  student: StudentFeeInput,
  plans: FeePlanWithClasses[],
  today: string,
): StudentFeeSummary {
  const classIds = new Set(student.classes.map((c) => c.id))
  // A plan's active flag only hides it from pickers; it always applies to its
  // classes, so what is owed never disappears when a plan is deactivated.
  const classPlans = plans.filter((p) =>
    p.class_ids.some((id) => classIds.has(id)),
  )
  const overrideId = student.account?.fee_plan_override_id ?? null
  const override = plans.find((p) => p.id === overrideId) ?? null
  const resolution = resolveFeePlan(override, classPlans)
  const feePlan = resolvedPlanOrNull(resolution)
  const paymentPlan = (student.account?.payment_plan ??
    null) as PaymentPlan | null
  const paid = sumPayments(student.payments)

  return {
    ...feeStatus({
      paymentPlan,
      feePlan,
      customTotal: student.account?.custom_total_amount ?? null,
      customUpToDate: student.account?.custom_up_to_date ?? false,
      paid,
      today,
    }),
    resolution,
    feePlan,
    paymentPlan,
    paid,
  }
}

export type StudentFeeRow = {
  id: string
  name: string
  studentCode: string | null
  active: boolean
  leavingReason: string | null
  classes: FeeClass[]
  paymentPlan: PaymentPlan | null
  feePlanName: string | null
  conflict: boolean
  paid: number
  due: number | null
  status: FeeStatus
  priorOwed: number
}

export function buildStudentFeeRows(
  students: StudentFeeListItem[],
  plans: FeePlanWithClasses[],
  today: string,
  priorOwed: Record<string, number>,
): StudentFeeRow[] {
  return students.map((s) => {
    const summary = summariseStudentFees(s, plans, today)
    return {
      id: s.id,
      name: `${s.last_name}, ${s.first_name}`,
      studentCode: s.student_code,
      active: s.active,
      leavingReason: s.leaving_reason,
      classes: s.classes,
      paymentPlan: summary.paymentPlan,
      feePlanName: summary.feePlan
        ? `${summary.feePlan.name} (${summary.feePlan.academic_year.code})`
        : null,
      conflict: summary.resolution.kind === 'conflict',
      paid: summary.paid,
      due: summary.due,
      status: summary.status,
      priorOwed: priorOwed[s.id] ?? 0,
    }
  })
}

/** The fee plans the account's override can pick: active ones, plus the
 * current override even if it has since been deactivated. */
export function feePlanOptions(
  plans: FeePlanWithClasses[],
  account: StudentFeeAccountRow | null,
): { id: string; label: string }[] {
  return plans
    .filter((p) => p.active || p.id === account?.fee_plan_override_id)
    .map((p) => ({ id: p.id, label: planLabel(p) }))
}

export type OtherYearRow = {
  year: AcademicYearRow
  paid: number
  total: number | null
  balance: number | null
  settled: boolean
}

/** The detail page's "Other years" strip: every year but the one on screen. */
export function summariseOtherYears(
  history: StudentFeeYear[],
  plansByYear: Record<string, FeePlanWithClasses[]>,
  currentYearId: string,
  today: string,
): OtherYearRow[] {
  return history
    .filter((yh) => yh.year.id !== currentYearId)
    .map((yh) => {
      const summary = summariseStudentFees(
        yh,
        plansByYear[yh.year.id] ?? [],
        today,
      )
      return {
        year: yh.year,
        paid: summary.paid,
        total: summary.total,
        balance:
          summary.total === null
            ? null
            : Math.max(summary.total - summary.paid, 0),
        settled: yh.account?.settled ?? false,
      }
    })
}

/**
 * Adds a payment to its year's history, starting a new entry (newest year
 * first) when the student had nothing in that year yet — a year with no
 * class or account, so it needs no plans to summarise.
 */
export function addPaymentToHistory(
  history: StudentFeeYear[],
  year: AcademicYearRow,
  payment: PaymentSummary,
): StudentFeeYear[] {
  if (history.some((yh) => yh.year.id === year.id)) {
    return history.map((yh) =>
      yh.year.id === year.id
        ? { ...yh, payments: [...yh.payments, payment] }
        : yh,
    )
  }
  return [
    ...history,
    { year, classes: [], account: null, payments: [payment] },
  ].sort((a, b) => b.year.start_date.localeCompare(a.year.start_date))
}

/** The order the detail query returns payments in: newest first. */
export function sortPaymentsNewestFirst<
  T extends { payment_date: string; created_at: string },
>(payments: T[]): T[] {
  return [...payments].sort(
    (a, b) =>
      b.payment_date.localeCompare(a.payment_date) ||
      b.created_at.localeCompare(a.created_at),
  )
}
