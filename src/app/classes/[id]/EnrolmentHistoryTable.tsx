import type { ReactElement } from 'react'

import SimpleGrid from '@/components/grid/SimpleGrid'
import { formatCalendarDate } from '@/lib/datetime'
import type { GridColumn } from '@/lib/grid/columns'
import { compareByName, compareDateDesc } from '@/lib/grid/sort'

export type EnrolmentHistoryRow = {
  id: string
  start_date: string
  end_date: string | null
  student: { id: string; first_name: string; last_name: string } | null
}

type RowWithStudent = EnrolmentHistoryRow & {
  student: NonNullable<EnrolmentHistoryRow['student']>
}

export default function EnrolmentHistoryTable({
  rows,
}: {
  rows: EnrolmentHistoryRow[]
}): ReactElement | null {
  const withStudent = rows.filter(
    (r): r is RowWithStudent => r.student !== null,
  )
  if (withStudent.length === 0) return null

  const sorted = [...withStudent].sort(
    (a, b) =>
      compareDateDesc(a.end_date, b.end_date) ||
      compareByName(a.student, b.student),
  )

  const columns: GridColumn<RowWithStudent>[] = [
    {
      id: 'name',
      header: 'Name',
      primary: true,
      cell: (row) => `${row.student.last_name}, ${row.student.first_name}`,
    },
    {
      id: 'from',
      header: 'From',
      cell: (row) => formatCalendarDate(row.start_date),
    },
    {
      id: 'to',
      header: 'To',
      cell: (row) => (row.end_date ? formatCalendarDate(row.end_date) : ''),
    },
  ]

  return (
    <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
      <h2 className="border-b border-gray-200 bg-gray-50 px-6 py-3 text-sm font-semibold text-gray-900">
        Enrolment history
      </h2>
      <SimpleGrid
        columns={columns}
        rows={sorted}
        getRowKey={(row) => row.id}
        frame="none"
      />
    </div>
  )
}
