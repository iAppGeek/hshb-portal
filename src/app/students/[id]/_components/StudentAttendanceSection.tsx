import SectionCard from '@/app/_components/SectionCard'
import { formatCalendarDate } from '@/lib/datetime'
import {
  formatAttendance,
  type DayStatus,
  type StudentAttendanceDay,
  type StudentAttendanceTotals,
} from '@/lib/studentAttendance'

const STATUS_LABEL: Record<DayStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  unmarked: 'Not marked',
}

const STATUS_CLASS: Record<DayStatus, string> = {
  present: 'bg-green-100 text-green-800',
  late: 'bg-amber-100 text-amber-800',
  absent: 'bg-red-100 text-red-800',
  unmarked: 'bg-gray-100 text-gray-600',
}

function breakdown(totals: StudentAttendanceTotals): string | null {
  const parts = [
    totals.late > 0 ? `${totals.late} late` : null,
    totals.absent > 0 ? `${totals.absent} absent` : null,
    totals.unmarked > 0 ? `${totals.unmarked} not marked` : null,
  ].filter((part) => part !== null)
  return parts.length > 0 ? parts.join(' · ') : null
}

export default function StudentAttendanceSection({
  yearCode,
  totals,
  days,
}: {
  yearCode: string
  totals: StudentAttendanceTotals
  days: StudentAttendanceDay[]
}): React.ReactElement {
  const counts = breakdown(totals)
  return (
    <SectionCard title={`Attendance · ${yearCode}`}>
      <div className="space-y-4 p-6">
        {totals.possible === 0 ? (
          <p className="text-sm text-gray-600">No registers taken this year.</p>
        ) : (
          <>
            <div>
              <p className="text-2xl font-semibold text-gray-900">
                {formatAttendance(totals.attended, totals.possible)}
              </p>
              {counts && <p className="mt-1 text-sm text-gray-600">{counts}</p>}
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-blue-700">
                Show all days ({totals.possible})
              </summary>
              <ul className="mt-3 space-y-2">
                {days.map((day) => (
                  <li
                    key={day.date}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>
                      <span className="text-gray-900">
                        {formatCalendarDate(day.date, {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="text-gray-500">
                        {' '}
                        · {day.classNames.join(', ')}
                      </span>
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[day.status]}`}
                    >
                      {STATUS_LABEL[day.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
    </SectionCard>
  )
}
