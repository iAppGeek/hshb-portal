import { unstable_cache, updateTag } from 'next/cache'

import type { Database } from '@/types/database'

import { supabase } from './client'

type Tables = Database['public']['Tables']

export type StudentFeeAccountRow = Tables['student_fee_accounts']['Row']
export type StudentPaymentRow = Tables['student_payments']['Row']

export type StudentFeeAccountInput = Omit<
  Tables['student_fee_accounts']['Insert'],
  'id' | 'student_id' | 'created_at' | 'updated_at'
>

export type StudentPaymentInput = {
  amount: number
  payment_date: string
  reference: string
  method: string
  notes: string | null
  recorded_by: string | null
}

export type FeeClass = {
  id: string
  name: string
  academic_year: string | null
}

export type PaymentSummary = { amount: number; payment_date: string }

export type StudentFeeListItem = {
  id: string
  first_name: string
  last_name: string
  student_code: string | null
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
  }
  classes: FeeClass[]
  account: StudentFeeAccountRow | null
  payments: StudentPaymentWithRecorder[]
}

type Enrolment = {
  student_id: string
  class: (FeeClass & { active: boolean }) | null
}

const PAGE_SIZE = 1000
const TAGS = ['students', 'classes', 'student-fees']

// Only active classes count: a migrated class stays linked to last year's
// students and would otherwise resolve to last year's fee plan.
function activeClasses(enrolments: Enrolment[]): FeeClass[] {
  return enrolments
    .map((e) => e.class)
    .filter((c): c is FeeClass & { active: boolean } => Boolean(c?.active))
    .map(({ id, name, academic_year }) => ({ id, name, academic_year }))
}

// PostgREST caps a response at 1000 rows; payments accumulate every year.
async function getAllPaymentSummaries(): Promise<
  (PaymentSummary & { student_id: string })[]
> {
  const rows: (PaymentSummary & { student_id: string })[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('student_payments')
      .select('student_id, amount, payment_date')
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

export const getStudentFeeList = unstable_cache(
  async (): Promise<StudentFeeListItem[]> => {
    const [{ data: students }, { data: enrolments }, { data: accounts }] =
      await Promise.all([
        supabase
          .from('students')
          .select('id, first_name, last_name, student_code')
          .eq('active', true)
          .order('last_name'),
        supabase
          .from('student_classes')
          .select('student_id, class:classes(id, name, academic_year, active)'),
        supabase.from('student_fee_accounts').select('*'),
      ])
    const payments = await getAllPaymentSummaries()

    const enrolmentsByStudent = new Map<string, Enrolment[]>()
    for (const e of (enrolments ?? []) as Enrolment[]) {
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

    return (students ?? []).map((s) => ({
      ...s,
      classes: activeClasses(enrolmentsByStudent.get(s.id) ?? []),
      account: accountByStudent.get(s.id) ?? null,
      payments: paymentsByStudent.get(s.id) ?? [],
    }))
  },
  ['student-fee-list'],
  { revalidate: 60, tags: TAGS },
)

export const getStudentFeeDetail = unstable_cache(
  async (studentId: string): Promise<StudentFeeDetail | null> => {
    const { data: student } = await supabase
      .from('students')
      .select('id, first_name, last_name, student_code')
      .eq('id', studentId)
      .maybeSingle()
    if (!student) return null

    const [{ data: enrolments }, { data: account }, { data: payments }] =
      await Promise.all([
        supabase
          .from('student_classes')
          .select('student_id, class:classes(id, name, academic_year, active)')
          .eq('student_id', studentId),
        supabase
          .from('student_fee_accounts')
          .select('*')
          .eq('student_id', studentId)
          .maybeSingle(),
        supabase
          .from('student_payments')
          .select('*, recorder:staff(first_name, last_name)')
          .eq('student_id', studentId)
          .order('payment_date', { ascending: false })
          .order('created_at', { ascending: false }),
      ])

    return {
      student,
      classes: activeClasses((enrolments ?? []) as Enrolment[]),
      account: account ?? null,
      payments: (payments ?? []) as StudentPaymentWithRecorder[],
    }
  },
  ['student-fee-detail'],
  { revalidate: 60, tags: TAGS },
)

export async function upsertStudentFeeAccount(
  studentId: string,
  input: StudentFeeAccountInput,
): Promise<void> {
  const { error } = await supabase
    .from('student_fee_accounts')
    .upsert({ ...input, student_id: studentId }, { onConflict: 'student_id' })
  if (error) throw error
  updateTag('student-fees')
}

export async function createStudentPayment(
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
