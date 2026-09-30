import EmailClassDropdown from '@/components/EmailClassDropdown'
import {
  getStudentsByIds,
  getAttendanceByClassAndDate,
  getEnrolmentsForClass,
} from '@/db'
import type { AttendanceStatus } from '@/db'
import { buildRegisterRoster } from '@/lib/enrolment'
import { todayInSchoolTz } from '@/lib/datetime'
import type { StaffRole } from '@/types/next-auth'

import AttendanceForm from './AttendanceForm'
import RegisterHeader, { type RegisterHeaderInfo } from './RegisterHeader'

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

  const header: RegisterHeaderInfo = {
    className,
    date,
    dateLabel:
      date === today ? 'Today' : date < today ? 'Historical' : 'Future',
    actions: (
      <EmailClassDropdown
        students={students}
        subject={`${className} — Attendance ${date}`}
      />
    ),
  }

  // The form owns the header once there is a roster, so "(register already
  // taken)" appears as soon as the first save lands, without a re-fetch.
  return roster.length === 0 ? (
    <>
      <RegisterHeader {...header} taken={existingRows.length > 0} />
      <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-200">
        <p className="text-gray-500">
          No students were in this class on this date.
        </p>
      </div>
    </>
  ) : (
    <AttendanceForm
      classId={classId}
      date={date}
      students={students}
      existing={existing}
      role={role}
      hasExisting={existingRows.length > 0}
      archived={archived}
      header={header}
    />
  )
}
