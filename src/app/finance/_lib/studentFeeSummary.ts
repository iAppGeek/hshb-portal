import type {
  FeeClass,
  FeePlanWithClasses,
  PaymentSummary,
  StudentFeeAccountRow,
  StudentFeeListItem,
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
  // A deactivated plan stops applying through classes but can still be chosen
  // as an explicit override.
  const classPlans = plans.filter(
    (p) => p.active && p.class_ids.some((id) => classIds.has(id)),
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
