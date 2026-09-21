'use client'

import { useState } from 'react'

import StudentDetailsModal, {
  type StudentForModal,
} from '@/components/StudentDetailsModal'
import Table from '@/components/grid/Table'
import TableCard from '@/components/grid/TableCard'
import Th from '@/components/grid/Th'
import Tooltip from '@/components/Tooltip'
import Tr from '@/components/grid/Tr'
import { useServerForm } from '@/components/form'
import { tbody, theadStacked } from '@/lib/grid/styles'
import { canUpdateAttendance } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import { saveAttendanceAction } from './actions'
import RegisterHeader, { type RegisterHeaderInfo } from './RegisterHeader'

type AttendanceStatus = 'present' | 'absent' | 'late'

type Student = StudentForModal & {
  student_code: string | null
}

type Props = {
  classId: string
  date: string
  students: Student[]
  existing: Record<string, AttendanceStatus>
  role: StaffRole
  hasExisting: boolean
  /** Registers outside the current academic year can be viewed but not changed. */
  archived?: boolean
  header: RegisterHeaderInfo
}

export default function AttendanceForm({
  classId,
  date,
  students,
  existing,
  role,
  hasExisting,
  archived = false,
  header,
}: Props) {
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [statuses, setStatuses] = useState<
    Record<string, AttendanceStatus | null>
  >(() => {
    const initial: Record<string, AttendanceStatus | null> = {}
    students.forEach((s) => {
      initial[s.id] = existing[s.id] ?? null
    })
    return initial
  })
  const [saved, setSaved] = useState(false)
  // Starts from the server's answer, then flips on the first save so a role
  // that can't update locks the register without the page being re-fetched.
  const [taken, setTaken] = useState(hasExisting)
  const readOnly = taken && !canUpdateAttendance(role)

  // Taps already show instantly (local state, one save per register), so on
  // success the statuses are synced to the rows as written; on error the
  // teacher's taps are kept for a retry.
  const { handleSubmit, isPending, error } = useServerForm(
    saveAttendanceAction,
    {
      onSuccess: ({ saved: rows }) => {
        setStatuses((prev) => {
          const next = { ...prev }
          for (const row of rows) {
            next[row.student_id] = row.status as AttendanceStatus
          }
          return next
        })
        setTaken(true)
        setSaved(true)
      },
    },
  )

  function toggle(studentId: string, status: AttendanceStatus) {
    if (archived) return
    setSaved(false)
    setStatuses((prev) => ({ ...prev, [studentId]: status }))
  }

  const allSelected = students.every((s) => statuses[s.id] !== null)

  const counts = {
    present: Object.values(statuses).filter((s) => s === 'present').length,
    late: Object.values(statuses).filter((s) => s === 'late').length,
    absent: Object.values(statuses).filter((s) => s === 'absent').length,
    unset: Object.values(statuses).filter((s) => s === null).length,
  }

  return (
    <>
      <RegisterHeader {...header} taken={taken} />
      <form onSubmit={handleSubmit}>
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="date" value={date} />

        {students.length === 0 ? (
          <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-200">
            <p className="text-gray-500">No students in this class.</p>
          </div>
        ) : (
          <>
            {/* Summary bar — 2×2 grid on mobile, single row on desktop */}
            <div className="mb-4 flex flex-wrap gap-2 text-sm sm:flex-nowrap sm:gap-4">
              <span className="w-[calc(50%-0.25rem)] rounded-full bg-green-100 px-3 py-1 text-center font-medium text-green-800 sm:w-auto sm:text-left">
                {counts.present} present
              </span>
              <span className="w-[calc(50%-0.25rem)] rounded-full bg-yellow-100 px-3 py-1 text-center font-medium text-yellow-800 sm:w-auto sm:text-left">
                {counts.late} late
              </span>
              <span className="w-[calc(50%-0.25rem)] rounded-full bg-red-100 px-3 py-1 text-center font-medium text-red-800 sm:w-auto sm:text-left">
                {counts.absent} absent
              </span>
              {counts.unset > 0 && (
                <span className="w-[calc(50%-0.25rem)] rounded-full bg-gray-100 px-3 py-1 text-center font-medium text-gray-500 sm:w-auto sm:text-left">
                  {counts.unset} unmarked
                </span>
              )}
            </div>

            <TableCard>
              <Table>
                <thead className={theadStacked}>
                  <tr>
                    <Th>Student</Th>
                    <Th>Status</Th>
                    <Th
                      meta={{
                        srOnlyHeader: true,
                        align: 'right',
                        className: 'sm:w-full',
                      }}
                    >
                      Details
                    </Th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {students.map((student) => {
                    const current = statuses[student.id]
                    return (
                      <Tr key={student.id} stacked>
                        {/* Name cell — on mobile also contains Details button */}
                        <td className="block px-4 pt-4 pb-2 text-sm font-medium text-gray-900 sm:table-cell sm:px-6 sm:py-4 sm:align-middle sm:whitespace-nowrap">
                          {/* Hidden inputs carry the data for the server action */}
                          <input
                            type="hidden"
                            name="studentId"
                            value={student.id}
                          />
                          {current !== null && (
                            <input
                              type="hidden"
                              name={`status_${student.id}`}
                              value={current}
                            />
                          )}
                          <div className="flex items-center justify-between gap-2 sm:block">
                            <span>
                              {student.last_name}, {student.first_name}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedStudent(student)}
                              className="shrink-0 text-sm text-gray-500 hover:text-gray-700 sm:hidden"
                            >
                              Details
                            </button>
                          </div>
                        </td>

                        {/* Status buttons — full width on mobile, compact on desktop */}
                        <td className="block px-4 pb-4 sm:table-cell sm:w-px sm:px-6 sm:py-4 sm:align-middle sm:whitespace-nowrap">
                          <div className="flex w-full overflow-hidden rounded-full ring-1 ring-gray-200 sm:w-auto">
                            <button
                              type="button"
                              disabled={archived}
                              onClick={() => toggle(student.id, 'present')}
                              className={`flex-1 px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed sm:flex-none ${
                                current === 'present'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-white text-gray-400 hover:bg-gray-50'
                              }`}
                            >
                              Present
                            </button>
                            <button
                              type="button"
                              disabled={archived}
                              onClick={() => toggle(student.id, 'late')}
                              className={`flex-1 border-x border-gray-200 px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed sm:flex-none ${
                                current === 'late'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-white text-gray-400 hover:bg-gray-50'
                              }`}
                            >
                              Late
                            </button>
                            <button
                              type="button"
                              disabled={archived}
                              onClick={() => toggle(student.id, 'absent')}
                              className={`flex-1 px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed sm:flex-none ${
                                current === 'absent'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-white text-gray-400 hover:bg-gray-50'
                              }`}
                            >
                              Absent
                            </button>
                          </div>
                        </td>

                        {/* Details — hidden on mobile (shown in name cell), visible on desktop */}
                        <td className="hidden sm:table-cell sm:px-6 sm:py-4 sm:text-right sm:align-middle sm:text-sm sm:font-medium">
                          <button
                            type="button"
                            onClick={() => setSelectedStudent(student)}
                            className="text-gray-500 hover:text-gray-700"
                          >
                            Details
                          </button>
                        </td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
            </TableCard>

            <div className="mt-4 flex items-center gap-4">
              {archived ? (
                <p className="text-sm text-gray-500">
                  This register is from a past academic year and is read-only.
                </p>
              ) : readOnly ? (
                <Tooltip text="You cannot update existing attendance records">
                  <span className="cursor-not-allowed rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white opacity-50 shadow-sm">
                    Save register
                  </span>
                </Tooltip>
              ) : (
                <span
                  title={
                    !allSelected
                      ? `${counts.unset} student${counts.unset === 1 ? '' : 's'} still unmarked`
                      : undefined
                  }
                  className={!allSelected ? 'cursor-not-allowed' : undefined}
                >
                  <button
                    type="submit"
                    disabled={isPending || !allSelected}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {isPending ? 'Saving…' : 'Save register'}
                  </button>
                </span>
              )}
              {saved && (
                <span className="text-sm text-green-600">Register saved.</span>
              )}
              {error && <span className="text-sm text-red-600">{error}</span>}
            </div>
          </>
        )}
        {selectedStudent && (
          <StudentDetailsModal
            student={selectedStudent}
            role={role}
            onClose={() => setSelectedStudent(null)}
          />
        )}
      </form>
    </>
  )
}
