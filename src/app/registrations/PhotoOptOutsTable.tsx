'use client'

import Link from 'next/link'

import FunctionalGrid, {
  type FunctionalGridColumn,
} from '@/clientComponents/grid/FunctionalGrid'
import type { PhotoOptOutRow } from '@/db'
import { formatDateInSchoolTz, formatDateTimeInSchoolTz } from '@/lib/datetime'
import { compareByName, compareNullableText } from '@/lib/grid/sort'
import { matchesAny, normaliseQuery } from '@/lib/grid/search'
import { rowLink } from '@/lib/grid/styles'

import StatusBadge from './StatusBadge'

type Props = {
  requests: PhotoOptOutRow[]
}

function matchesOptOutSearch(r: PhotoOptOutRow, rawQuery: string): boolean {
  const q = normaliseQuery(rawQuery)
  if (!q) return true
  return matchesAny([`${r.child_first_name} ${r.child_last_name}`], q)
}

const columns: FunctionalGridColumn<PhotoOptOutRow>[] = [
  {
    id: 'child',
    header: 'Child',
    cell: (info) =>
      `${info.row.original.child_last_name}, ${info.row.original.child_first_name}`,
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
    id: 'declaration_name',
    header: 'Declared by',
    cell: (info) => info.row.original.declaration_name,
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
    cell: (info) => <StatusBadge status={info.row.original.status} />,
    sortFn: (rowA, rowB) =>
      compareNullableText(rowA.original.status, rowB.original.status),
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: (info) => (
      <Link
        href={`/registrations/photo-opt-outs/${info.row.original.id}`}
        className={`font-medium ${rowLink}`}
      >
        Review
      </Link>
    ),
    enableSorting: false,
    meta: { srOnlyHeader: true, align: 'right' },
  },
]

export default function PhotoOptOutsTable({
  requests,
}: Props): React.ReactElement {
  return (
    <FunctionalGrid
      data={requests}
      columns={columns}
      getRowId={(r) => r.id}
      mobile="hide-columns"
      search={{
        placeholder: 'Search by child name…',
        label: 'Search by child name',
        filterFn: matchesOptOutSearch,
      }}
      initialSorting={[{ id: 'submitted_at', desc: true }]}
      emptyMessage="No photo opt-out requests found."
    />
  )
}
