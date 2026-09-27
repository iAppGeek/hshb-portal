import 'server-only'

import { and, asc, desc, eq, sql, sum } from 'drizzle-orm'

import { feeClassesForYear } from '@/lib/enrolment'
import {
  feeStatus,
  resolveFeePlan,
  resolvedPlanOrNull,
  type PaymentPlan,
} from '@/lib/fees'

import type { AcademicYearRow } from './academic-years'
import { toCamel, toSnake, type Snake } from './casing'
import { db, type Tx } from './client'
import {
  academicYears,
  classes,
  studentFeeAccounts,
  studentPayments,
  students,
  type NewStudentFeeAccount,
  type StudentFeeAccount,
  type StudentPayment,
} from './schema'

export type StudentFeeAccountRow = Snake<StudentFeeAccount>
export type StudentPaymentRow = Snake<StudentPayment>

export type StudentFeeAccountInput = Omit<
  Snake<NewStudentFeeAccount>,
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

type Stay = { startDate: string; endDate: string | null; class: FeeClass }

const studentColumns = {
  id: true,
  firstName: true,
  lastName: true,
  studentCode: true,
  active: true,
  leavingReason: true,
} as const

/** Ids of the classes in one academic year, as a subquery. */
function classesOfYear(yearId: string) {
  return db
    .select({ id: classes.id })
    .from(classes)
    .where(eq(classes.academicYearId, yearId))
}

/** The classes whose fee plan applies, from a student's stays in one year. */
function feeClasses(stays: Stay[]): FeeClass[] {
  return feeClassesForYear(
    stays.map((s) => ({
      start_date: s.startDate,
      end_date: s.endDate,
      class: s.class,
    })),
  ).map((s) => ({ id: s.class.id, name: s.class.name }))
}

function toPaymentSummary(p: {
  amount: number
  paymentDate: string
}): PaymentSummary {
  return { amount: p.amount, payment_date: p.paymentDate }
}

export async function getStudentFeeList(
  yearId: string,
): Promise<StudentFeeListItem[]> {
  const rows = await db.query.students.findMany({
    columns: studentColumns,
    with: {
      studentClasses: {
        columns: { startDate: true, endDate: true },
        where: (sc, { inArray }) => inArray(sc.classId, classesOfYear(yearId)),
        orderBy: (sc, { asc }) => asc(sc.id),
        with: { class: { columns: { id: true, name: true } } },
      },
      feeAccounts: {
        where: (a, { eq }) => eq(a.academicYearId, yearId),
      },
      payments: {
        columns: { amount: true, paymentDate: true },
        where: (p, { eq }) => eq(p.academicYearId, yearId),
        orderBy: (p, { asc }) => asc(p.id),
      },
    },
    orderBy: asc(students.lastName),
  })

  // Leavers only appear in a year they have something in.
  return rows
    .filter(
      (s) =>
        s.active ||
        s.studentClasses.length > 0 ||
        s.feeAccounts.length > 0 ||
        s.payments.length > 0,
    )
    .map(({ studentClasses: stays, feeAccounts, payments, ...student }) => ({
      ...toSnake(student),
      classes: feeClasses(stays),
      account: feeAccounts[0] ? toSnake(feeAccounts[0]) : null,
      payments: payments.map(toPaymentSummary),
    }))
}

export async function getStudentFeeDetail(
  studentId: string,
  yearId: string,
): Promise<StudentFeeDetail | null> {
  const row = await db.query.students.findFirst({
    columns: studentColumns,
    where: eq(students.id, studentId),
    with: {
      studentClasses: {
        columns: { startDate: true, endDate: true },
        where: (sc, { inArray }) => inArray(sc.classId, classesOfYear(yearId)),
        with: { class: { columns: { id: true, name: true } } },
      },
      feeAccounts: {
        where: (a, { eq }) => eq(a.academicYearId, yearId),
      },
      payments: {
        where: (p, { eq }) => eq(p.academicYearId, yearId),
        orderBy: (p, { desc }) => [desc(p.paymentDate), desc(p.createdAt)],
        with: {
          recorder: { columns: { firstName: true, lastName: true } },
        },
      },
    },
  })
  if (!row) return null

  const { studentClasses: stays, feeAccounts, payments, ...student } = row
  return {
    student: toSnake(student),
    classes: feeClasses(stays),
    account: feeAccounts[0] ? toSnake(feeAccounts[0]) : null,
    payments: toSnake(payments),
  }
}

/** Every year (newest first) the student has a class, an account or a
 * payment — feeds the detail page's "Previous years" strip. */
export async function getStudentFeeYears(
  studentId: string,
): Promise<StudentFeeYear[]> {
  const years = await db.query.academicYears.findMany({
    orderBy: desc(academicYears.startDate),
    with: {
      classes: {
        columns: { id: true, name: true },
        with: {
          studentClasses: {
            columns: { startDate: true, endDate: true },
            where: (sc, { eq }) => eq(sc.studentId, studentId),
          },
        },
      },
      studentFeeAccounts: {
        where: (a, { eq }) => eq(a.studentId, studentId),
      },
      studentPayments: {
        columns: { amount: true, paymentDate: true },
        where: (p, { eq }) => eq(p.studentId, studentId),
      },
    },
  })

  return years
    .map(
      ({
        classes: yearClasses,
        studentFeeAccounts: accounts,
        studentPayments: payments,
        ...year
      }) => ({
        year: toSnake(year),
        stays: yearClasses.flatMap((c) =>
          c.studentClasses.map((sc) => ({
            ...sc,
            class: { id: c.id, name: c.name },
          })),
        ),
        account: accounts[0] ? toSnake(accounts[0]) : null,
        payments: payments.map(toPaymentSummary),
      }),
    )
    .filter(
      (y) =>
        feeClasses(y.stays).length > 0 ||
        y.account !== null ||
        y.payments.length > 0,
    )
    .map(({ stays, ...y }) => ({ ...y, classes: feeClasses(stays) }))
}

/**
 * Sum of everything still owed from years before `yearId`, per student.
 * Only counted where the year's total is known (a plan/override with a
 * payment plan, or a custom plan with an agreed total) and the account
 * isn't settled (decision 4). One query: each unsettled prior-year account
 * with a payment plan, its year's plans, the student's stays and the
 * year's payments summed.
 */
export async function getPriorYearBalances(
  yearId: string,
): Promise<Record<string, number>> {
  const targetStart = db
    .select({ startDate: academicYears.startDate })
    .from(academicYears)
    .where(eq(academicYears.id, yearId))
  const priorYears = db
    .select({ id: academicYears.id })
    .from(academicYears)
    .where(sql`${academicYears.startDate} < (${targetStart})`)

  const accounts = await db.query.studentFeeAccounts.findMany({
    columns: {
      studentId: true,
      paymentPlan: true,
      feePlanOverrideId: true,
      customTotalAmount: true,
      customUpToDate: true,
    },
    where: (a, { and, eq, inArray, isNotNull }) =>
      and(
        inArray(a.academicYearId, priorYears),
        eq(a.settled, false),
        isNotNull(a.paymentPlan),
      ),
    extras: (a) => ({
      paid: sql<number>`coalesce((${db
        .select({ total: sum(studentPayments.amount) })
        .from(studentPayments)
        .where(
          and(
            eq(studentPayments.studentId, a.studentId),
            eq(studentPayments.academicYearId, a.academicYearId),
          ),
        )}), 0)`
        .mapWith(Number)
        .as('paid'),
    }),
    with: {
      academicYear: {
        columns: { id: true, code: true, startDate: true, endDate: true },
        with: {
          feePlans: {
            with: { feePlanClasses: { columns: { classId: true } } },
          },
        },
      },
      student: {
        columns: {},
        with: {
          studentClasses: {
            columns: { startDate: true, endDate: true },
            with: {
              class: {
                columns: { id: true, name: true, academicYearId: true },
              },
            },
          },
        },
      },
    },
  })

  // Newest year first, so each student's total adds up in the same order
  // as before (floating-point addition is order-sensitive).
  accounts.sort((a, b) =>
    b.academicYear.startDate.localeCompare(a.academicYear.startDate),
  )

  const totals: Record<string, number> = {}
  for (const account of accounts) {
    const { feePlans: yearPlans, ...year } = account.academicYear
    const academicYear = toSnake({
      code: year.code,
      startDate: year.startDate,
      endDate: year.endDate,
    })
    const plans = yearPlans.map(({ feePlanClasses, ...plan }) => ({
      ...toSnake(plan),
      academic_year: academicYear,
      class_ids: feePlanClasses.map((link) => link.classId),
    }))
    const classIds = new Set(
      feeClasses(
        account.student.studentClasses.filter(
          (sc) => sc.class.academicYearId === year.id,
        ),
      ).map((c) => c.id),
    )
    // Plan status never hides a debt: inactive plans still apply.
    const classPlans = plans.filter((p) =>
      p.class_ids.some((id) => classIds.has(id)),
    )
    const override =
      plans.find((p) => p.id === account.feePlanOverrideId) ?? null
    const feePlan = resolvedPlanOrNull(resolveFeePlan(override, classPlans))
    const { total } = feeStatus({
      paymentPlan: account.paymentPlan as PaymentPlan,
      feePlan,
      customTotal: account.customTotalAmount,
      customUpToDate: account.customUpToDate,
      paid: account.paid,
      today: year.endDate,
    })
    if (total === null) continue
    const owed = Math.max(total - account.paid, 0)
    if (owed > 0) {
      totals[account.studentId] = (totals[account.studentId] ?? 0) + owed
    }
  }
  return totals
}

export async function upsertStudentFeeAccount(
  studentId: string,
  yearId: string,
  input: StudentFeeAccountInput,
): Promise<StudentFeeAccountRow> {
  const values = toCamel(input)
  const [row] = await db
    .insert(studentFeeAccounts)
    .values({ ...values, studentId, academicYearId: yearId })
    .onConflictDoUpdate({
      target: [studentFeeAccounts.studentId, studentFeeAccounts.academicYearId],
      set: values,
    })
    .returning()
  return toSnake(row)
}

async function findPayment(
  tx: Tx,
  id: string,
): Promise<StudentPaymentWithRecorder> {
  const row = await tx.query.studentPayments.findFirst({
    where: eq(studentPayments.id, id),
    with: { recorder: { columns: { firstName: true, lastName: true } } },
  })
  return toSnake(row!)
}

export async function addStudentPayment(
  studentId: string,
  input: StudentPaymentInput,
): Promise<StudentPaymentWithRecorder> {
  return db.transaction(async (tx) => {
    const [{ id }] = await tx
      .insert(studentPayments)
      .values({ ...toCamel(input), studentId })
      .returning({ id: studentPayments.id })
    return findPayment(tx, id)
  })
}

/** Scoped to the student so a payment id from another page can't be deleted. */
export async function deleteStudentPayment(
  studentId: string,
  paymentId: string,
): Promise<boolean> {
  const rows = await db
    .delete(studentPayments)
    .where(
      and(
        eq(studentPayments.id, paymentId),
        eq(studentPayments.studentId, studentId),
      ),
    )
    .returning({ id: studentPayments.id })
  return rows.length > 0
}
