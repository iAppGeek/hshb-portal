'use client'

import Link from 'next/link'

import FunctionalGrid, {
  type FunctionalGridColumn,
} from '@/clientComponents/grid/FunctionalGrid'
import type { RegistrationSummary } from '@/db'
import { formatDateInSchoolTz, formatDateTimeInSchoolTz } from '@/lib/datetime'
import { compareByName, compareNullableText } from '@/lib/grid/sort'
import { matchesAny, normaliseQuery } from '@/lib/grid/search'

type Props = {
  registrations: RegistrationSummary[]
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  actioned: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

function matchesRegistrationSearch(
  r: RegistrationSummary,
  rawQuery: string,
): boolean {
  const q = normaliseQuery(rawQuery)
  if (!q) return true
  return matchesAny([`${r.child_first_name} ${r.child_last_name}`], q)
}

const columns: FunctionalGridColumn<RegistrationSummary>[] = [
  {
    id: 'child',
    header: 'Child',
    cell: (info) => (
      <Link href={`/registrations/${info.row.original.id}`} className="block">
        {info.row.original.child_last_name},{' '}
        {info.row.original.child_first_name}
      </Link>
    ),
    sortFn: (rowA, rowB) =>
      compareByName(
        {
          first_name: rowA.original.child_first_name,
          last_name: rowA.original.child_last_name,
        },
        {
          first_name: rowB.original.child_first_name,
          last_name: rowB.original.child_last_name,
        },
      ),
    meta: { primary: true },
  },
  {
    id: 'date_of_birth',
    header: 'DOB',
    cell: (info) => formatDateInSchoolTz(info.row.original.date_of_birth),
    enableSorting: false,
    meta: { mobile: 'hide' },
  },
  {
    id: 'preferred_year_group',
    header: 'Year group pref.',
    cell: (info) => info.row.original.preferred_year_group ?? '—',
    enableSorting: false,
    meta: { mobile: 'hide' },
  },
  {
    id: 'primary_contact',
    header: 'Primary contact',
    cell: (info) => {
      const contact = info.row.original.primary_contact
      return contact
        ? `${contact.first_name} ${contact.last_name} — ${contact.phone}`
        : '—'
    },
    enableSorting: false,
    meta: { mobile: 'hide' },
  },
  {
    id: 'submitted_at',
    header: 'Submitted',
    cell: (info) => formatDateTimeInSchoolTz(info.row.original.submitted_at),
    sortFn: (rowA, rowB) =>
      compareNullableText(
        rowA.original.submitted_at,
        rowB.original.submitted_at,
      ),
    meta: { mobile: 'hide' },
  },
  {
    id: 'status',
    header: 'Status',
    cell: (info) => (
      <span
        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize ${STATUS_BADGE[info.row.original.status] ?? 'bg-gray-100 text-gray-800'}`}
      >
        {info.row.original.status}
      </span>
    ),
    sortFn: (rowA, rowB) =>
      compareNullableText(rowA.original.status, rowB.original.status),
  },
]

export default function RegistrationsTable({
  registrations,
}: Props): React.ReactElement {
  return (
    <FunctionalGrid
      data={registrations}
      columns={columns}
      getRowId={(r) => r.id}
      mobile="hide-columns"
      search={{
        placeholder: 'Search by child name…',
        label: 'Search by child name',
        filterFn: matchesRegistrationSearch,
      }}
      initialSorting={[{ id: 'submitted_at', desc: true }]}
      emptyMessage="No registrations found."
    />
  )
}
