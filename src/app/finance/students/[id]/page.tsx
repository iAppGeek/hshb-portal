import { type Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getFeePlans, getStudentFeeDetail } from '@/db'
import { labelFor } from '@/lib/compliance'
import { formatCalendarDate, todayInSchoolTz } from '@/lib/datetime'
import {
  formatGbp,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PLAN_LABELS,
  paymentsInAcademicYear,
} from '@/lib/fees'
import { canManageFinance } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import FeeStatusBadge from '../../_components/FeeStatusBadge'
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
const TH =
  'px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase'
const TD = 'px-3 py-3 text-sm text-gray-700'

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
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactElement> {
  const session = await auth()
  const role = session?.user?.role as StaffRole | undefined

  if (!role || !canManageFinance(role)) {
    redirect('/dashboard')
  }

  const { id } = await params
  const [detail, plans] = await Promise.all([
    getStudentFeeDetail(id),
    getFeePlans(),
  ])

  if (!detail) {
    redirect('/finance?tab=students')
  }

  const today = todayInSchoolTz()
  const { student, account, payments, classes } = detail
  const summary = summariseStudentFees(detail, plans, today)
  const countedIds = new Set(
    paymentsInAcademicYear(
      payments,
      summary.feePlan?.academic_year ?? null,
    ).map((p) => p.id),
  )
  const planOptions = plans
    .filter((p) => p.active || p.id === account?.fee_plan_override_id)
    .map((p) => ({ id: p.id, label: planLabel(p) }))

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href="/finance?tab=students"
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← Student fees
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          {student.last_name}, {student.first_name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {[student.student_code, classes.map((c) => c.name).join(', ')]
            .filter(Boolean)
            .join(' · ') || 'No active classes'}
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
              {summary.feePlan ? ` in ${summary.feePlan.academic_year}` : ''}
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
        planOptions={planOptions}
        action={saveStudentFeeAccountAction.bind(null, student.id)}
      />

      <div className={CARD}>
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Payments</h2>
        <PaymentForm
          defaultDate={today}
          action={addStudentPaymentAction.bind(null, student.id)}
        />

        {payments.length === 0 ? (
          <p className="mt-6 text-sm text-gray-500">No payments recorded.</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className={TH}>Date</th>
                  <th className={TH}>Amount</th>
                  <th className={TH}>Method</th>
                  <th className={TH}>Reference</th>
                  <th className={TH}>Notes</th>
                  <th className={TH}>Recorded by</th>
                  <th className={`relative ${TH}`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className={`${TD} whitespace-nowrap`}>
                      {formatCalendarDate(p.payment_date, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {!countedIds.has(p.id) && (
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                          Other year
                        </span>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {formatGbp(p.amount)}
                    </td>
                    <td className={TD}>
                      {labelFor(PAYMENT_METHOD_LABELS, p.method)}
                    </td>
                    <td className={TD}>{p.reference}</td>
                    <td className={TD}>{p.notes ?? '—'}</td>
                    <td className={TD}>
                      {p.recorder
                        ? `${p.recorder.first_name} ${p.recorder.last_name}`
                        : '—'}
                    </td>
                    <td className={`${TD} text-right`}>
                      <DeletePaymentButton
                        paymentId={p.id}
                        reference={p.reference}
                        action={deleteStudentPaymentAction.bind(
                          null,
                          student.id,
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
