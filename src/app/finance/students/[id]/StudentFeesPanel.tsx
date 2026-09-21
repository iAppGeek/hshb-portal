'use client'

import { useState } from 'react'
import Link from 'next/link'

import SimpleGrid from '@/components/grid/SimpleGrid'
// One type per line: src/security.spec.ts only lets a client component reach
// @/db through a single-line `import type`.
import type { AcademicYearRow } from '@/db'
import type { FeeClass } from '@/db'
import type { FeePlanWithClasses } from '@/db'
import type { StudentFeeAccountRow } from '@/db'
import type { StudentFeeYear } from '@/db'
import type { StudentPaymentWithRecorder } from '@/db'
import type { ActionResult } from '@/lib/action'
import { labelFor } from '@/lib/compliance'
import { formatCalendarDate } from '@/lib/datetime'
import {
  formatGbp,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PLAN_LABELS,
} from '@/lib/fees'
import type { GridColumn } from '@/lib/grid/columns'
import { rowLink } from '@/lib/grid/styles'

import FeeStatusBadge from '../../_components/FeeStatusBadge'
import { planLabel } from '../../_lib/feePlanClasses'
import {
  addPaymentToHistory,
  feePlanOptions,
  sortPaymentsNewestFirst,
  summariseOtherYears,
  summariseStudentFees,
  type OtherYearRow,
  type StudentFeeSummary,
} from '../../_lib/studentFeeSummary'

import DeletePaymentButton from './DeletePaymentButton'
import PaymentForm from './PaymentForm'
import StudentFeesForm from './StudentFeesForm'

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

type Props = {
  studentId: string
  yearId: string
  today: string
  years: AcademicYearRow[]
  classes: FeeClass[]
  /** Plans for the year on screen. */
  plans: FeePlanWithClasses[]
  /** Plans for each of the student's other years, keyed by year id. */
  plansByYear: Record<string, FeePlanWithClasses[]>
  initialAccount: StudentFeeAccountRow | null
  initialPayments: StudentPaymentWithRecorder[]
  initialHistory: StudentFeeYear[]
  saveAccountAction: (
    formData: FormData,
  ) => Promise<ActionResult<StudentFeeAccountRow>>
  addPaymentAction: (
    formData: FormData,
  ) => Promise<ActionResult<StudentPaymentWithRecorder>>
  deletePaymentAction: (
    paymentId: string,
  ) => Promise<ActionResult<{ id: string }>>
}

/**
 * Holds the account and payments the page was rendered with and applies each
 * save's result to them, so every figure below updates without re-fetching
 * the page.
 */
export default function StudentFeesPanel({
  studentId,
  yearId,
  today,
  years,
  classes,
  plans,
  plansByYear,
  initialAccount,
  initialPayments,
  initialHistory,
  saveAccountAction,
  addPaymentAction,
  deletePaymentAction,
}: Props): React.ReactElement {
  const [account, setAccount] = useState(initialAccount)
  const [payments, setPayments] = useState(initialPayments)
  // Other years' payments, so one recorded against another year shows there.
  const [history, setHistory] = useState(initialHistory)

  const summary = summariseStudentFees(
    { classes, account, payments },
    plans,
    today,
  )
  const otherYears = summariseOtherYears(history, plansByYear, yearId, today)

  function handlePaymentAdded(payment: StudentPaymentWithRecorder): void {
    if (payment.academic_year_id === yearId) {
      setPayments((prev) => sortPaymentsNewestFirst([payment, ...prev]))
      return
    }
    const year = years.find((y) => y.id === payment.academic_year_id)
    if (year) setHistory((prev) => addPaymentToHistory(prev, year, payment))
  }

  function handlePaymentDeleted(paymentId: string): void {
    setPayments((prev) => prev.filter((p) => p.id !== paymentId))
  }

  const otherYearsColumns: GridColumn<OtherYearRow>[] = [
    {
      id: 'year',
      header: 'Year',
      primary: true,
      cell: (py) => (
        <Link
          href={`/finance/students/${studentId}?year=${py.year.id}`}
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

  const paymentColumns: GridColumn<StudentPaymentWithRecorder>[] = [
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
          action={deletePaymentAction}
          onDeleted={handlePaymentDeleted}
        />
      ),
    },
  ]

  return (
    <>
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
        planOptions={feePlanOptions(plans, account)}
        action={saveAccountAction}
        onSaved={setAccount}
      />

      {otherYears.length > 0 && (
        <div className={CARD}>
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Other years
          </h2>
          <SimpleGrid
            columns={otherYearsColumns}
            rows={otherYears}
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
          action={addPaymentAction}
          onAdded={handlePaymentAdded}
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
    </>
  )
}
