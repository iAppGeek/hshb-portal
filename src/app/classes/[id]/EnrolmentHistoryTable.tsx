import { formatCalendarDate } from '@/lib/datetime'

export type EnrolmentHistoryRow = {
  start_date: string
  end_date: string | null
  student: { id: string; first_name: string; last_name: string } | null
}

const TH =
  'px-6 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase'
const TD = 'px-6 py-3 text-sm text-gray-600'

export default function EnrolmentHistoryTable({
  rows,
}: {
  rows: EnrolmentHistoryRow[]
}) {
  const withStudent = rows.filter(
    (
      r,
    ): r is EnrolmentHistoryRow & {
      student: NonNullable<EnrolmentHistoryRow['student']>
    } => r.student !== null,
  )
  if (withStudent.length === 0) return null

  const sorted = [...withStudent].sort((a, b) => {
    if ((a.end_date === null) !== (b.end_date === null)) {
      return a.end_date === null ? -1 : 1
    }
    if (a.end_date !== b.end_date) {
      return (b.end_date ?? '').localeCompare(a.end_date ?? '')
    }
    return a.student.last_name.localeCompare(b.student.last_name)
  })

  return (
    <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
      <h2 className="border-b border-gray-200 bg-gray-50 px-6 py-3 text-sm font-semibold text-gray-900">
        Enrolment history
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th className={TH}>Name</th>
              <th className={TH}>From</th>
              <th className={TH}>To</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sorted.map((row, i) => (
              <tr key={`${row.student.id}-${i}`} className="hover:bg-gray-50">
                <td className={`${TD} font-medium text-gray-900`}>
                  {row.student.last_name}, {row.student.first_name}
                </td>
                <td className={TD}>{formatCalendarDate(row.start_date)}</td>
                <td className={TD}>
                  {row.end_date ? formatCalendarDate(row.end_date) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
