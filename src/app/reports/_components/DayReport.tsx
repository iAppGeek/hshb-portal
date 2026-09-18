import SimpleGrid from '@/components/grid/SimpleGrid'
import type { GridColumn } from '@/lib/grid/columns'

import SectionCard from '../../_components/SectionCard'

type Stat = {
  label: string
  value: string | number
  sub: string | null
}

type ClassRow = {
  name: string
  enrolled: number
  presentCount: number | null
  attendanceCreatedAt: string | null
  attendanceUpdatedAt: string | null
}

type Props = {
  stats: Stat[]
  enrolmentByClass: ClassRow[]
}

const columns: GridColumn<ClassRow>[] = [
  { id: 'class', header: 'Class', primary: true, cell: (row) => row.name },
  {
    id: 'attendance',
    header: 'Attendance',
    cell: (row) =>
      row.presentCount !== null
        ? `${row.presentCount}/${row.enrolled}`
        : `—/${row.enrolled}`,
  },
  {
    id: 'record_times',
    header: 'Record Times',
    cell: (row) =>
      row.attendanceCreatedAt ? (
        <div className="flex flex-col gap-0.5">
          <span>Created: {row.attendanceCreatedAt}</span>
          <span>Updated: {row.attendanceUpdatedAt}</span>
        </div>
      ) : (
        <span className="font-medium text-amber-600">Not Completed</span>
      ),
  },
]

export default function DayReport({ stats, enrolmentByClass }: Props) {
  return (
    <>
      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(({ label, value, sub }) => (
          <div
            key={label}
            className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-6"
          >
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-1 flex items-center gap-2">
              <span className="text-3xl font-bold text-gray-900">{value}</span>
              {sub && (
                <span className="text-sm font-medium text-gray-500">{sub}</span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Attendance by class */}
      <SectionCard title="Attendance by Class">
        <SimpleGrid
          columns={columns}
          rows={enrolmentByClass}
          getRowKey={(row) => row.name}
          frame="none"
        />
      </SectionCard>
    </>
  )
}
