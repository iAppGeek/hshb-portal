import { unstable_cache, updateTag } from 'next/cache'

import { feeClassesForYear } from '@/lib/enrolment'
import {
  feeStatus,
  resolveFeePlan,
  resolvedPlanOrNull,
  sumPayments,
  type PaymentPlan,
} from '@/lib/fees'
import type { Database } from '@/types/database'

import { getAcademicYears, type AcademicYearRow } from './academic-years'
import { supabase } from './client'
import { getFeePlans } from './fee-plans'
import { fetchAllPages } from './paging'

type Tables = Database['public']['Tables']

export type StudentFeeAccountRow = Tables['student_fee_accounts']['Row']
export type StudentPaymentRow = Tables['student_payments']['Row']

export type StudentFeeAccountInput = Omit<
  Tables['student_fee_accounts']['Insert'],
  'id' | 'student_id' | 'academic_year_id' | 'created_at' | 'updated_at'
>

export type StudentPaymentInput = {
  amount: number
  payment_date: string
  reference: string
  method: string
  notes: string | null
  recorded_by: string | null
  academic_year_id: string
}

export type FeeClass = {
  id: string
  name: string
}

export type PaymentSummary = { amount: number; payment_date: string }

export type StudentFeeListItem = {
  id: string
  first_name: string
  last_name: string
  student_code: string | null
  active: boolean
  leaving_reason: string | null
  classes: FeeClass[]
  account: StudentFeeAccountRow | null
  payments: PaymentSummary[]
}

export type StudentPaymentWithRecorder = StudentPaymentRow & {
  recorder: { first_name: string; last_name: string } | null
}

export type StudentFeeDetail = {
  student: {
    id: string
    first_name: string
    last_name: string
    student_code: string | null
    active: boolean
    leaving_reason: string | null
  }
  classes: FeeClass[]
  account: StudentFeeAccountRow | null
  payments: StudentPaymentWithRecorder[]
}

export type StudentFeeYear = {
  year: AcademicYearRow
  classes: FeeClass[]
  account: StudentFeeAccountRow | null
  payments: PaymentSummary[]
}

type DatedEnrolment = {
  student_id: string
  start_date: string
  end_date: string | null
  class: FeeClass | null
}

const TAGS = ['students', 'classes', 'student-fees']

// PostgREST caps a response at 1000 rows; payments accumulate every year.
async function getAllPaymentSummaries(
  yearId: string,
): Promise<(PaymentSummary & { student_id: string })[]> {
  return fetchAllPages((from, to) =>
    supabase
      .from('student_payments')
      .select('student_id, amount, payment_date')
      .eq('academic_year_id', yearId)
      .order('id')
      .range(from, to),
  )
}

async function getAllEnrolmentsForYear(
  yearId: string,
): Promise<DatedEnrolment[]> {
  return fetchAllPages((from, to) =>
    supabase
      .from('student_classes')
      .select('student_id, start_date, end_date, class:classes!inner(id, name)')
      .eq('class.academic_year_id', yearId)
      .order('id')
      .range(from, to),
  )
}

export const getStudentFeeList = unstable_cache(
  async (yearId: string): Promise<StudentFeeListItem[]> => {
    const [{ data: students }, enrolments, { data: accounts }] =
      await Promise.all([
        supabase
          .from('students')
          .select(
            'id, first_name, last_name, student_code, active, leaving_reason',
          )
          .order('last_name'),
        getAllEnrolmentsForYear(yearId),
        supabase
          .from('student_fee_accounts')
          .select('*')
          .eq('academic_year_id', yearId),
      ])
    const payments = await getAllPaymentSummaries(yearId)

    const enrolmentsByStudent = new Map<string, DatedEnrolment[]>()
    for (const e of enrolments) {
      if (!e.class) continue
      const list = enrolmentsByStudent.get(e.student_id) ?? []
      list.push(e)
      enrolmentsByStudent.set(e.student_id, list)
    }
    const accountByStudent = new Map(
      (accounts ?? []).map((a) => [a.student_id, a]),
    )
    const paymentsByStudent = new Map<string, PaymentSummary[]>()
    for (const { student_id, amount, payment_date } of payments) {
      const list = paymentsByStudent.get(student_id) ?? []
      list.push({ amount, payment_date })
      paymentsByStudent.set(student_id, list)
    }

    return (students ?? [])
      .map((s) => {
        const studentEnrolments = enrolmentsByStudent.get(s.id) ?? []
        return {
          ...s,
          classes: feeClassesForYear(studentEnrolments).map(
            (e) => e.class as FeeClass,
          ),
          account: accountByStudent.get(s.id) ?? null,
          payments: paymentsByStudent.get(s.id) ?? [],
          hasEnrolment: studentEnrolments.length > 0,
        }
      })
      .filter(
        (s) =>
          s.active ||
          s.hasEnrolment ||
          accountByStudent.has(s.id) ||
          paymentsByStudent.has(s.id),
      )
      .map(({ hasEnrolment: _hasEnrolment, ...rest }) => rest)
  },
  ['student-fee-list'],
  { revalidate: 60, tags: TAGS },
)

export const getStudentFeeDetail = unstable_cache(
  async (
    studentId: string,
    yearId: string,
  ): Promise<StudentFeeDetail | null> => {
    const { data: student } = await supabase
      .from('students')
      .select('id, first_name, last_name, student_code, active, leaving_reason')
      .eq('id', studentId)
      .maybeSingle()
    if (!student) return null

    const [{ data: enrolments }, { data: account }, { data: payments }] =
      await Promise.all([
        supabase
          .from('student_classes')
          .select(
            'student_id, start_date, end_date, class:classes!inner(id, name)',
          )
          .eq('student_id', studentId)
          .eq('class.academic_year_id', yearId),
        supabase
          .from('student_fee_accounts')
          .select('*')
          .eq('student_id', studentId)
          .eq('academic_year_id', yearId)
          .maybeSingle(),
        supabase
          .from('student_payments')
          .select('*, recorder:staff(first_name, last_name)')
          .eq('student_id', studentId)
          .eq('academic_year_id', yearId)
          .order('payment_date', { ascending: false })
          .order('created_at', { ascending: false }),
      ])

    return {
      student,
      classes: feeClassesForYear(
        ((enrolments ?? []) as DatedEnrolment[]).filter((e) => e.class),
      ).map((e) => e.class as FeeClass),
      account: account ?? null,
      payments: (payments ?? []) as StudentPaymentWithRecorder[],
    }
  },
  ['student-fee-detail'],
  { revalidate: 60, tags: TAGS },
)

/** Every year (newest first) the student has a class, an account or a
 * payment — feeds the detail page's "Previous years" strip. */
export const getStudentFeeYears = unstable_cache(
  async (studentId: string): Promise<StudentFeeYear[]> => {
    const years = await getAcademicYears()
    const [{ data: enrolments }, { data: accounts }, { data: payments }] =
      await Promise.all([
        supabase
          .from('student_classes')
          .select(
            'start_date, end_date, class:classes(id, name, academic_year_id)',
          )
          .eq('student_id', studentId),
        supabase
          .from('student_fee_accounts')
          .select('*')
          .eq('student_id', studentId),
        supabase
          .from('student_payments')
          .select('amount, payment_date, academic_year_id')
          .eq('student_id', studentId),
      ])

    type YearEnrolment = {
      start_date: string
      end_date: string | null
      class: { id: string; name: string; academic_year_id: string } | null
    }
    const enrolmentsByYear = new Map<
      string,
      (YearEnrolment & { class: NonNullable<YearEnrolment['class']> })[]
    >()
    for (const e of (enrolments ?? []) as YearEnrolment[]) {
      if (!e.class) continue
      const list = enrolmentsByYear.get(e.class.academic_year_id) ?? []
      list.push({ ...e, class: e.class })
      enrolmentsByYear.set(e.class.academic_year_id, list)
    }
    const classesByYear = new Map<string, FeeClass[]>()
    for (const [yearId, yearEnrolments] of enrolmentsByYear) {
      classesByYear.set(
        yearId,
        feeClassesForYear(yearEnrolments).map((e) => ({
          id: e.class.id,
          name: e.class.name,
        })),
      )
    }
    const accountByYear = new Map(
      (accounts ?? []).map((a) => [a.academic_year_id, a]),
    )
    const paymentsByYear = new Map<string, PaymentSummary[]>()
    for (const p of payments ?? []) {
      const list = paymentsByYear.get(p.academic_year_id) ?? []
      list.push({ amount: p.amount, payment_date: p.payment_date })
      paymentsByYear.set(p.academic_year_id, list)
    }

    return years
      .filter(
        (y) =>
          classesByYear.has(y.id) ||
          accountByYear.has(y.id) ||
          paymentsByYear.has(y.id),
      )
      .map((y) => ({
        year: y,
        classes: classesByYear.get(y.id) ?? [],
        account: accountByYear.get(y.id) ?? null,
        payments: paymentsByYear.get(y.id) ?? [],
      }))
  },
  ['student-fee-years'],
  { revalidate: 60, tags: TAGS },
)

/**
 * Sum of everything still owed from years before `yearId`, per student.
 * Only counted where the year's total is known (a plan/override with a
 * payment plan, or a custom plan with an agreed total) and the account
 * isn't settled (decision 4).
 */
export async function getPriorYearBalances(
  yearId: string,
): Promise<Record<string, number>> {
  const years = await getAcademicYears()
  const target = years.find((y) => y.id === yearId)
  if (!target) return {}
  const priorYears = years.filter((y) => y.start_date < target.start_date)

  const totals: Record<string, number> = {}
  for (const year of priorYears) {
    const [list, plans] = await Promise.all([
      getStudentFeeList(year.id),
      getFeePlans(year.id),
    ])
    for (const s of list) {
      if (s.account?.settled) continue
      const classIds = new Set(s.classes.map((c) => c.id))
      // Plan status never hides a debt: inactive plans still apply.
      const classPlans = plans.filter((p) =>
        p.class_ids.some((id) => classIds.has(id)),
      )
      const overrideId = s.account?.fee_plan_override_id ?? null
      const override = plans.find((p) => p.id === overrideId) ?? null
      const feePlan = resolvedPlanOrNull(resolveFeePlan(override, classPlans))
      const paymentPlan = (s.account?.payment_plan ??
        null) as PaymentPlan | null
      const paid = sumPayments(s.payments)
      const { total } = feeStatus({
        paymentPlan,
        feePlan,
        customTotal: s.account?.custom_total_amount ?? null,
        customUpToDate: s.account?.custom_up_to_date ?? false,
        paid,
        today: year.end_date,
      })
      if (total === null) continue
      const owed = Math.max(total - paid, 0)
      if (owed > 0) totals[s.id] = (totals[s.id] ?? 0) + owed
    }
  }
  return totals
}

export async function upsertStudentFeeAccount(
  studentId: string,
  yearId: string,
  input: StudentFeeAccountInput,
): Promise<void> {
  const { error } = await supabase
    .from('student_fee_accounts')
    .upsert(
      { ...input, student_id: studentId, academic_year_id: yearId },
      { onConflict: 'student_id,academic_year_id' },
    )
  if (error) throw error
  updateTag('student-fees')
}

export async function addStudentPayment(
  studentId: string,
  input: StudentPaymentInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('student_payments')
    .insert({ ...input, student_id: studentId })
    .select('id')
    .single()
  if (error) throw error
  updateTag('student-fees')
  return data
}

/** Scoped to the student so a payment id from another page can't be deleted. */
export async function deleteStudentPayment(
  studentId: string,
  paymentId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('student_payments')
    .delete()
    .eq('id', paymentId)
    .eq('student_id', studentId)
    .select('id')
  if (error) throw error
  updateTag('student-fees')
  return (data ?? []).length > 0
}
