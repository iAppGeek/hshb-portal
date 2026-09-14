'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import {
  FEE_STATUS_LABELS,
  formatGbp,
  PAYMENT_PLAN_LABELS,
  type FeeStatus,
  type PaymentPlan,
} from '@/lib/fees'

import FeeStatusBadge from '../../_components/FeeStatusBadge'
import type { StudentFeeRow } from '../../_lib/studentFeeSummary'

type PlanFilter = '' | PaymentPlan | 'none'
type StatusFilter = '' | FeeStatus | 'conflict' | 'owes_prior'

const TH =
  'px-3 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase'
const TD = 'px-3 py-3 text-sm text-gray-700'
const SELECT =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'

export default function StudentFeesTable({
  rows,
  yearId,
}: {
  rows: StudentFeeRow[]
  yearId: string
}): React.ReactElement {
  const [query, setQuery] = useState('')
  const [classId, setClassId] = useState('')
  const [plan, setPlan] = useState<PlanFilter>('')
  const [status, setStatus] = useState<StatusFilter>('')

  const classOptions = useMemo(
    () =>
      [
        ...new Map(
          rows.flatMap((r) => r.classes).map((c) => [c.id, c]),
        ).values(),
      ].sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (!q ||
          r.name.toLowerCase().includes(q) ||
          (r.studentCode ?? '').toLowerCase().includes(q)) &&
        (!classId || r.classes.some((c) => c.id === classId)) &&
        (plan === '' ||
          (plan === 'none'
            ? r.paymentPlan === null
            : r.paymentPlan === plan)) &&
        (status === '' ||
          (status === 'conflict'
            ? r.conflict
            : status === 'owes_prior'
              ? r.priorOwed > 0
              : r.status === status)),
    )
  }, [rows, query, classId, plan, status])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search students…"
          aria-label="Search students"
          className={`${SELECT} w-full sm:max-w-xs`}
        />
        <select
          aria-label="Filter by class"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className={SELECT}
        >
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by payment plan"
          value={plan}
          onChange={(e) => setPlan(e.target.value as PlanFilter)}
          className={SELECT}
        >
          <option value="">All payment plans</option>
          {Object.entries(PAYMENT_PLAN_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          <option value="none">No payment plan</option>
        </select>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className={SELECT}
        >
          <option value="">All statuses</option>
          {Object.entries(FEE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          <option value="conflict">Multiple fee plans</option>
          <option value="owes_prior">Owes from previous years</option>
        </select>
      </div>

      <p className="text-sm text-gray-500">
        Showing {filtered.length} of {rows.length} students
      </p>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className={TH}>Student</th>
                <th className={TH}>Classes</th>
                <th className={TH}>Payment plan</th>
                <th className={TH}>Fee plan</th>
                <th className={TH}>Paid</th>
                <th className={TH}>Due to date</th>
                <th className={TH}>Status</th>
                <th className={TH}>Owed (prev. years)</th>
                <th className={`relative ${TH}`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className={`${TD} text-center text-gray-500`}>
                    No students match these filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td
                      className={`${TD} font-medium whitespace-nowrap text-gray-900`}
                    >
                      {r.name}
                      {r.studentCode && (
                        <span className="ml-1 text-xs text-gray-400">
                          {r.studentCode}
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      {r.classes.map((c) => c.name).join(', ') || '—'}
                    </td>
                    <td className={TD}>
                      {r.paymentPlan ? PAYMENT_PLAN_LABELS[r.paymentPlan] : '—'}
                    </td>
                    <td className={TD}>
                      {r.conflict ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800">
                          Multiple fee plans
                        </span>
                      ) : (
                        (r.feePlanName ?? '—')
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {formatGbp(r.paid)}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {r.due === null ? '—' : formatGbp(r.due)}
                    </td>
                    <td className={TD}>
                      <FeeStatusBadge status={r.status} />
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {r.priorOwed > 0 ? formatGbp(r.priorOwed) : ''}
                    </td>
                    <td className={`${TD} text-right`}>
                      <Link
                        href={`/finance/students/${r.id}?year=${yearId}`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
