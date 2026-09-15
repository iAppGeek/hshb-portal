import BulkEmailDropdown from '@/clientComponents/BulkEmailDropdown'
import {
  getStudentsByIds,
  getAttendanceByClassAndDate,
  getEnrolmentsForClass,
} from '@/db'
import type { AttendanceStatus } from '@/db'
import { buildRegisterRoster } from '@/lib/enrolment'
import { todayInSchoolTz } from '@/lib/datetime'
import { guardianEmailsForMailto, mailtoWithBcc } from '@/lib/mailto'
import type { StaffRole } from '@/types/next-auth'

import AttendanceForm from './AttendanceForm'

type Props = {
  classId: string
  date: string
  className: string
  role: StaffRole
  /** The class is outside the current academic year, so the register is read-only. */
  archived?: boolean
}

export default async function AttendanceRegister({
  classId,
  date,
  className,
  role,
  archived = false,
}: Props) {
  const [existingRows, enrolments] = await Promise.all([
    getAttendanceByClassAndDate(classId, date),
    getEnrolmentsForClass(classId),
  ])

  const roster = buildRegisterRoster(
    existingRows.map((r) => r.student_id),
    enrolments,
    date,
  )
  const students = await getStudentsByIds(roster)

  const existing: Record<string, AttendanceStatus> = {}
  for (const row of existingRows) {
    existing[row.student_id] = row.status as AttendanceStatus
  }

  const today = todayInSchoolTz()
  const dateLabel =
    date === today ? 'Today' : date < today ? 'Historical' : 'Future'

  const attendanceBcc = guardianEmailsForMailto(students)
  const attendanceMailtoHref = mailtoWithBcc(attendanceBcc, {
    subject: `${className} — Attendance ${date}`,
  })

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <span>
          {className} &mdash; {date}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${date === today ? 'bg-green-500' : 'bg-amber-500'}`}
        >
          {dateLabel}
        </span>
        {existingRows.length > 0 && (
          <span className="text-green-600">(register already taken)</span>
        )}
        {students.length > 0 && (
          <div className="ml-auto sm:ml-0">
            <BulkEmailDropdown
              emails={attendanceBcc}
              mailtoHref={attendanceMailtoHref}
              buttonLabel="Email class"
              triggerClassName="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 shadow-sm transition hover:bg-blue-50"
              emptyReason="No guardian email addresses on file for this class."
              mailtoUnavailableReason="Too many addresses for your email app. Use copy instead."
            />
          </div>
        )}
      </div>
      {roster.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-200">
          <p className="text-gray-500">
            No students were in this class on this date.
          </p>
        </div>
      ) : (
        <AttendanceForm
          classId={classId}
          date={date}
          students={students}
          existing={existing}
          role={role}
          hasExisting={existingRows.length > 0}
          archived={archived}
        />
      )}
    </>
  )
}
