'use client'

import Link from 'next/link'

import FunctionalGrid, {
  type FunctionalGridColumn,
} from '@/clientComponents/grid/FunctionalGrid'
import type { StackedRowSpec } from '@/lib/grid/columns'
import {
  digitsOnly,
  fullName,
  isPhoneShapedQuery,
  matchesAny,
  normaliseQuery,
} from '@/lib/grid/search'
import { compareByName, compareNullableNumber } from '@/lib/grid/sort'

type Guardian = {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  child_count: number
}

type Props = {
  guardians: Guardian[]
}

// Phone numbers are stored formatted (e.g. "07700 900000"), so a
// phone-shaped query matches on digits only, rather than a raw substring,
// against phone alone — a name/email query never falls into the phone
// comparison, and vice versa.
function matchesGuardianSearch(g: Guardian, rawQuery: string): boolean {
  const q = normaliseQuery(rawQuery)
  if (!q) return true
  if (isPhoneShapedQuery(q)) {
    return digitsOnly(g.phone).includes(digitsOnly(q))
  }
  return matchesAny([fullName(g.first_name, g.last_name), g.email ?? ''], q)
}

const columns: FunctionalGridColumn<Guardian>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: (info) => {
      const g = info.row.original
      return `${g.last_name}, ${g.first_name}`
    },
    sortFn: (rowA, rowB) => compareByName(rowA.original, rowB.original),
    meta: { primary: true },
  },
  {
    id: 'phone',
    header: 'Phone',
    cell: (info) => info.row.original.phone,
    enableSorting: false,
  },
  {
    id: 'email',
    header: 'Email',
    cell: (info) => info.row.original.email ?? '—',
    enableSorting: false,
  },
  {
    id: 'children',
    header: 'Children',
    cell: (info) => info.row.original.child_count,
    sortFn: (rowA, rowB) =>
      compareNullableNumber(
        rowA.original.child_count,
        rowB.original.child_count,
      ),
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: (info) => {
      const g = info.row.original
      return (
        <div className="flex items-center justify-end gap-3 font-medium">
          <Link
            href={`/guardians/${g.id}`}
            className="text-blue-600 hover:text-blue-800"
          >
            View
          </Link>
          <Link
            href={`/guardians/${g.id}/edit`}
            className="text-blue-600 hover:text-blue-800"
          >
            Edit
          </Link>
        </div>
      )
    },
    enableSorting: false,
    meta: { srOnlyHeader: true, align: 'right' },
  },
]

const stacked: StackedRowSpec<Guardian> = {
  title: (g) => `${g.last_name}, ${g.first_name}`,
  titleAside: (g) => (
    <Link
      href={`/guardians/${g.id}`}
      className="shrink-0 text-sm text-blue-600 hover:text-blue-800"
    >
      View
    </Link>
  ),
  details: (g) => [
    g.phone,
    g.email ?? '—',
    `${g.child_count} ${g.child_count === 1 ? 'child' : 'children'}`,
  ],
  detailsAside: (g) => (
    <Link
      href={`/guardians/${g.id}/edit`}
      className="shrink-0 text-sm text-blue-600 hover:text-blue-800"
    >
      Edit
    </Link>
  ),
}

// Guardian viewing and editing share one gate (canViewGuardians and
// canEditGuardians are both admin-only), so unlike StudentsTable this never
// needs a permission-denied fallback for the edit link.
export default function GuardiansTable({
  guardians,
}: Props): React.ReactElement {
  return (
    <FunctionalGrid
      data={guardians}
      columns={columns}
      getRowId={(g) => g.id}
      mobile="stacked"
      stacked={stacked}
      search={{
        placeholder: 'Search by name, email or phone…',
        label: 'Search by name, email or phone',
        filterFn: matchesGuardianSearch,
      }}
      initialSorting={[{ id: 'name', desc: false }]}
      emptyMessage="No guardians match your search."
    />
  )
}
