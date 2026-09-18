'use client'

import Link from 'next/link'

import FunctionalGrid, {
  type FacetConfig,
  type FunctionalGridColumn,
} from '@/clientComponents/grid/FunctionalGrid'
import LeaverBadge from '@/components/LeaverBadge'
import { FEE_STATUS_LABELS, formatGbp, PAYMENT_PLAN_LABELS } from '@/lib/fees'
import { matchesAny, normaliseQuery } from '@/lib/grid/search'
import { compareNullableNumber, compareNullableText } from '@/lib/grid/sort'

import FeeStatusBadge from '../../_components/FeeStatusBadge'
import {
  matchesPlanFilter,
  matchesStatusFilter,
  type PlanFilter,
  type StatusFilter,
} from '../../_lib/studentFeeFilters'
import type { StudentFeeRow } from '../../_lib/studentFeeSummary'

type Props = {
  rows: StudentFeeRow[]
  yearId: string
}

function matchesStudentFeeSearch(
  row: StudentFeeRow,
  rawQuery: string,
): boolean {
  const q = normaliseQuery(rawQuery)
  if (!q) return true
  return matchesAny([row.name, row.studentCode ?? ''], q)
}

function facetsFor(rows: StudentFeeRow[]): FacetConfig[] {
  const classOptions = [
    ...new Map(rows.flatMap((r) => r.classes).map((c) => [c.id, c])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name))

  return [
    {
      columnId: 'classes',
      label: 'Filter by class',
      placeholderOption: 'All classes',
      options: classOptions.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      columnId: 'paymentPlan',
      label: 'Filter by payment plan',
      placeholderOption: 'All payment plans',
      options: [
        ...Object.entries(PAYMENT_PLAN_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
        { value: 'none', label: 'No payment plan' },
      ],
    },
    {
      columnId: 'status',
      label: 'Filter by status',
      placeholderOption: 'All statuses',
      options: [
        ...Object.entries(FEE_STATUS_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
        { value: 'conflict', label: 'Multiple fee plans' },
        { value: 'owes_prior', label: 'Owes from previous years' },
      ],
    },
  ]
}

function columnsFor(yearId: string): FunctionalGridColumn<StudentFeeRow>[] {
  return [
    {
      id: 'student',
      header: 'Student',
      cell: (info) => {
        const r = info.row.original
        return (
          <>
            {r.name}
            {r.studentCode && (
              <span className="ml-1 text-xs text-gray-400">
                {r.studentCode}
              </span>
            )}
            {!r.active && (
              <span className="ml-2">
                <LeaverBadge reason={r.leavingReason} />
              </span>
            )}
          </>
        )
      },
      sortFn: (rowA, rowB) =>
        compareNullableText(rowA.original.name, rowB.original.name),
      meta: { primary: true, className: 'whitespace-nowrap' },
    },
    {
      id: 'classes',
      header: 'Classes',
      cell: (info) =>
        info.row.original.classes.map((c) => c.name).join(', ') || '—',
      enableSorting: false,
      filterFn: (row, _columnId, value: string) =>
        row.original.classes.some((c) => c.id === value),
    },
    {
      id: 'paymentPlan',
      header: 'Payment plan',
      cell: (info) => {
        const plan = info.row.original.paymentPlan
        return plan ? PAYMENT_PLAN_LABELS[plan] : '—'
      },
      enableSorting: false,
      filterFn: (row, _columnId, value: PlanFilter) =>
        matchesPlanFilter(row.original, value),
    },
    {
      id: 'feePlan',
      header: 'Fee plan',
      cell: (info) => {
        const r = info.row.original
        return r.conflict ? (
          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800">
            Multiple fee plans
          </span>
        ) : (
          (r.feePlanName ?? '—')
        )
      },
      enableSorting: false,
    },
    {
      id: 'paid',
      header: 'Paid',
      cell: (info) => formatGbp(info.row.original.paid),
      sortFn: (rowA, rowB) =>
        compareNullableNumber(rowA.original.paid, rowB.original.paid),
      meta: { className: 'whitespace-nowrap' },
    },
    {
      id: 'due',
      header: 'Due to date',
      cell: (info) => {
        const due = info.row.original.due
        return due === null ? '—' : formatGbp(due)
      },
      sortFn: (rowA, rowB) =>
        compareNullableNumber(rowA.original.due, rowB.original.due),
      meta: { className: 'whitespace-nowrap' },
    },
    {
      id: 'status',
      header: 'Status',
      cell: (info) => <FeeStatusBadge status={info.row.original.status} />,
      sortFn: (rowA, rowB) =>
        compareNullableText(rowA.original.status, rowB.original.status),
      filterFn: (row, _columnId, value: StatusFilter) =>
        matchesStatusFilter(row.original, value),
    },
    {
      id: 'priorOwed',
      header: 'Owed (prev. years)',
      cell: (info) => {
        const priorOwed = info.row.original.priorOwed
        return priorOwed > 0 ? formatGbp(priorOwed) : ''
      },
      sortFn: (rowA, rowB) =>
        compareNullableNumber(rowA.original.priorOwed, rowB.original.priorOwed),
      meta: { className: 'whitespace-nowrap' },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => (
        <Link
          href={`/finance/students/${info.row.original.id}?year=${yearId}`}
          className="font-medium text-blue-600 hover:text-blue-800"
        >
          Manage
        </Link>
      ),
      enableSorting: false,
      meta: { srOnlyHeader: true, align: 'right' },
    },
  ]
}

export default function StudentFeesTable({
  rows,
  yearId,
}: Props): React.ReactElement {
  return (
    <FunctionalGrid
      data={rows}
      columns={columnsFor(yearId)}
      getRowId={(r) => r.id}
      mobile="scroll"
      search={{
        placeholder: 'Search students…',
        label: 'Search students',
        filterFn: matchesStudentFeeSearch,
      }}
      facets={facetsFor(rows)}
      initialSorting={[{ id: 'student', desc: false }]}
      showCount
      countNoun="students"
      emptyMessage="No students match these filters."
    />
  )
}
