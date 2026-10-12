import SimpleGrid from '@/components/grid/SimpleGrid'
import { getClassSessionDates } from '@/db'
import { formatSessionDate, todayInSchoolTz } from '@/lib/datetime'
import type { GridColumn } from '@/lib/grid/columns'
import type { ClassSessionDate } from '@/lib/classSessions'
import { attendancePercent } from '@/lib/studentAttendance'

function attendanceText(row: ClassSessionDate): string {
  if (!row.taken || row.roster === 0) return '—'
  const percent = attendancePercent(row.attended, row.roster)
  return `${percent}% · ${row.attended} attended / ${row.absent} absent`
}

const columns: GridColumn<ClassSessionDate>[] = [
  {
    id: 'date',
    header: 'Date',
    primary: true,
    cell: (row) => formatSessionDate(row.date),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => (
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          row.taken
            ? 'bg-green-100 text-green-800'
            : 'bg-amber-100 text-amber-800'
        }`}
      >
        {row.taken ? 'TAKEN' : 'NOT TAKEN'}
      </span>
    ),
  },
  {
    id: 'attendance',
    header: 'Attendance',
    cell: (row) => attendanceText(row),
  },
]

export default async function ClassSessionDatesTable({
  classId,
  academicYearId,
  yearStart,
}: {
  classId: string
  academicYearId: string
  yearStart: string
}): Promise<React.ReactElement | null> {
  const rows = await getClassSessionDates(
    classId,
    academicYearId,
    yearStart,
    todayInSchoolTz(),
  )
  if (rows.length === 0) return null

  return (
    <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
      <h2 className="border-b border-gray-200 bg-gray-50 px-6 py-3 text-sm font-semibold text-gray-900">
        Class Session Dates
      </h2>
      <SimpleGrid
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.date}
        frame="none"
      />
    </div>
  )
}
