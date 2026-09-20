import { type Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { requireRole } from '@/auth/require'
import SimpleGrid from '@/components/grid/SimpleGrid'
import {
  getAcademicYears,
  getCurrentAcademicYear,
  getFeePlans,
  getStudentFeeDetail,
  getStudentFeeYears,
} from '@/db'
import { resolveYearId } from '@/lib/academicYears'
import { labelFor } from '@/lib/compliance'
import { formatCalendarDate, todayInSchoolTz } from '@/lib/datetime'
import {
  formatGbp,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PLAN_LABELS,
} from '@/lib/fees'
import type { GridColumn } from '@/lib/grid/columns'
import { rowLink } from '@/lib/grid/styles'
import { canManageFinance } from '@/lib/permissions'
import LeaverBadge from '@/components/LeaverBadge'

import FeeStatusBadge from '../../_components/FeeStatusBadge'
import YearSelector from '../../../_components/YearSelector'
import { planLabel } from '../../_lib/feePlanClasses'
import {
  summariseStudentFees,
  type StudentFeeSummary,
} from '../../_lib/studentFeeSummary'

import DeletePaymentButton from './DeletePaymentButton'
import PaymentForm from './PaymentForm'
import StudentFeesForm from './StudentFeesForm'
import {
  addStudentPaymentAction,
  deleteStudentPaymentAction,
  saveStudentFeeAccountAction,
} from './actions'

export const metadata: Metadata = { title: 'Student Fees' }

const CARD = 'rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200'

function FeePlanSummary({
  summary,
}: {
  summary: StudentFeeSummary
}): React.ReactElement {
  const { resolution } = summary
  switch (resolution.kind) {
    case 'override':
      return <>{planLabel(resolution.plan)} · override</>
    case 'class':
      return <>{planLabel(resolution.plan)} · from class</>
    case 'conflict':
      return (
        <span className="text-amber-800">
          Classes are on more than one plan:{' '}
          {resolution.plans.map(planLabel).join(', ')}. Choose a fee plan
          override below.
        </span>
      )
    case 'none':
      return (
        <span className="text-gray-500">
          None. Attach a class to a fee plan or choose an override.
        </span>
      )
  }
}

export default async function StudentFeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ year?: string }>
}): Promise<React.ReactElement> {
  await requireRole(canManageFinance)

  const { id } = await params
  const { year } = await searchParams
  const [years, currentYear] = await Promise.all([
    getAcademicYears(),
    getCurrentAcademicYear(),
  ])
  const yearId = resolveYearId(years, year, currentYear.id)

  const [detail, plans, yearsHistory] = await Promise.all([
    getStudentFeeDetail(id, yearId),
    getFeePlans(yearId),
    getStudentFeeYears(id),
  ])

  if (!detail) {
    redirect('/finance?tab=students')
  }

  const today = todayInSchoolTz()
  const { student, account, payments, classes } = detail
  const summary = summariseStudentFees(detail, plans, today)
  const planOptions = plans
    .filter((p) => p.active || p.id === account?.fee_plan_override_id)
    .map((p) => ({ id: p.id, label: planLabel(p) }))

  const previousYears = await Promise.all(
    yearsHistory
      .filter((yh) => yh.year.id !== yearId)
      .map(async (yh) => {
        const yearPlans = await getFeePlans(yh.year.id)
        const yearSummary = summariseStudentFees(yh, yearPlans, today)
        return {
          year: yh.year,
          paid: yearSummary.paid,
          total: yearSummary.total,
          balance:
            yearSummary.total === null
              ? null
              : Math.max(yearSummary.total - yearSummary.paid, 0),
          settled: yh.account?.settled ?? false,
        }
      }),
  )

  type PreviousYear = (typeof previousYears)[number]
  const otherYearsColumns: GridColumn<PreviousYear>[] = [
    {
      id: 'year',
      header: 'Year',
      primary: true,
      cell: (py) => (
        <Link
          href={`/finance/students/${student.id}?year=${py.year.id}`}
          className={rowLink}
        >
          {py.year.code}
        </Link>
      ),
    },
    {
      id: 'total',
      header: 'Total',
      cell: (py) => (py.total === null ? '—' : formatGbp(py.total)),
    },
    { id: 'paid', header: 'Paid', cell: (py) => formatGbp(py.paid) },
    {
      id: 'balance',
      header: 'Balance',
      cell: (py) => (py.balance === null ? '—' : formatGbp(py.balance)),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (py) =>
        py.settled ? (
          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            Settled
          </span>
        ) : null,
    },
  ]

  type Payment = (typeof payments)[number]
  const paymentColumns: GridColumn<Payment>[] = [
    {
      id: 'date',
      header: 'Date',
      className: 'whitespace-nowrap',
      cell: (p) =>
        formatCalendarDate(p.payment_date, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
    },
    {
      id: 'amount',
      header: 'Amount',
      className: 'whitespace-nowrap',
      cell: (p) => formatGbp(p.amount),
    },
    {
      id: 'method',
      header: 'Method',
      cell: (p) => labelFor(PAYMENT_METHOD_LABELS, p.method),
    },
    { id: 'reference', header: 'Reference', cell: (p) => p.reference },
    { id: 'notes', header: 'Notes', cell: (p) => p.notes ?? '—' },
    {
      id: 'recorded_by',
      header: 'Recorded by',
      cell: (p) =>
        p.recorder ? `${p.recorder.first_name} ${p.recorder.last_name}` : '—',
    },
    {
      id: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      cell: (p) => (
        <DeletePaymentButton
          paymentId={p.id}
          reference={p.reference}
          action={deleteStudentPaymentAction.bind(null, student.id)}
        />
      ),
    },
  ]

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href={`/finance?tab=students&year=${yearId}`}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← Student fees
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            {student.last_name}, {student.first_name}
            {!student.active && <LeaverBadge reason={student.leaving_reason} />}
          </h1>
          <YearSelector
            years={years}
            value={yearId}
            basePath={`/finance/students/${student.id}`}
          />
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {[student.student_code, classes.map((c) => c.name).join(', ')]
            .filter(Boolean)
            .join(' · ') || 'No classes this year'}
        </p>
      </div>

      <div className={CARD}>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className="mt-1" data-testid="fee-status">
              <FeeStatusBadge status={summary.status} />
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Fee plan</dt>
            <dd className="mt-1 text-gray-900" data-testid="fee-plan">
              <FeePlanSummary summary={summary} />
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Payment plan</dt>
            <dd className="mt-1 text-gray-900">
              {labelFor(PAYMENT_PLAN_LABELS, summary.paymentPlan)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">
              Paid
              {summary.feePlan
                ? ` in ${summary.feePlan.academic_year.code}`
                : ''}
            </dt>
            <dd className="mt-1 text-gray-900" data-testid="paid-to-date">
              {formatGbp(summary.paid)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Due to date / year total</dt>
            <dd className="mt-1 text-gray-900">
              {summary.due === null ? '—' : formatGbp(summary.due)} /{' '}
              {summary.total === null ? '—' : formatGbp(summary.total)}
            </dd>
          </div>
        </dl>
      </div>

      <StudentFeesForm
        account={account}
        academicYearId={yearId}
        planOptions={planOptions}
        action={saveStudentFeeAccountAction.bind(null, student.id)}
      />

      {previousYears.length > 0 && (
        <div className={CARD}>
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Other years
          </h2>
          <SimpleGrid
            columns={otherYearsColumns}
            rows={previousYears}
            getRowKey={(py) => py.year.id}
            frame="none"
          />
        </div>
      )}

      <div className={CARD}>
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Payments</h2>
        <PaymentForm
          defaultDate={today}
          years={years}
          defaultYearId={yearId}
          action={addStudentPaymentAction.bind(null, student.id)}
        />

        {payments.length === 0 ? (
          <p className="mt-6 text-sm text-gray-500">No payments recorded.</p>
        ) : (
          <div className="mt-6">
            <SimpleGrid
              columns={paymentColumns}
              rows={payments}
              getRowKey={(p) => p.id}
              frame="none"
            />
          </div>
        )}
      </div>
    </div>
  )
}
