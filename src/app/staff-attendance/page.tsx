import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import DatePicker from '@/components/DatePicker'
import PrintPageSetup from '@/components/grid/PrintPageSetup'
import {
  getAllClasses,
  getAllStaff,
  getStaffAttendanceByDate,
  getStaffAttendanceForToday,
} from '@/db'
import {
  formatCalendarDate,
  nowTimeInSchoolTz,
  todayInSchoolTz,
} from '@/lib/datetime'
import { compareNullableText } from '@/lib/grid/sort'
import { isTeacher, showsOnSignInSheet } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import PrintButton from './PrintButton'
import SignInSheetPrintTable from './SignInSheetPrintTable'
import StaffAttendanceTable from './StaffAttendanceTable'

export const metadata: Metadata = { title: 'Staff Sign-In' }

export default async function StaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const role = session.user?.role as StaffRole
  const staffId = session.user?.staffId ?? ''

  const today = todayInSchoolTz()
  const currentTime = nowTimeInSchoolTz()

  if (isTeacher(role)) {
    // Teachers always see today only, for themselves
    const [record, classes] = await Promise.all([
      getStaffAttendanceForToday(staffId, today),
      getAllClasses(),
    ])
    const myClass = classes.find((c) => c.teacher_id === staffId)
    const staffRow = {
      id: staffId,
      first_name: session.user.name?.split(' ')[0] ?? '',
      last_name: session.user.name?.split(' ').slice(1).join(' ') ?? '',
      display_name: session.user.name ?? null,
      class_name: myClass?.name ?? null,
      room_number: myClass?.room_number ?? null,
    }

    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">
          Your Attendance Today
        </h1>
        <StaffAttendanceTable
          rows={[{ staff: staffRow, record }]}
          defaultTime={currentTime}
          date={today}
          role={role}
          currentStaffId={staffId}
        />
      </div>
    )
  }

  // Admin / headteacher: full staff list with date picker
  const { date: qDate } = await searchParams
  const selectedDate = qDate ?? today
  const isToday = selectedDate === today
  const defaultTime = isToday ? currentTime : '09:00'

  const [allStaff, attendanceRecords, classes] = await Promise.all([
    getAllStaff(),
    getStaffAttendanceByDate(selectedDate),
    getAllClasses(),
  ])

  const recordByStaffId = Object.fromEntries(
    attendanceRecords.map((r) => [r.staff_id, r]),
  )
  const classByTeacherId = Object.fromEntries(
    classes.filter((c) => c.teacher_id).map((c) => [c.teacher_id!, c]),
  )

  const rows = allStaff
    .filter((s) => showsOnSignInSheet(s.role as StaffRole))
    .map((s) => {
      const cls = classByTeacherId[s.id]
      return {
        staff: {
          id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
          display_name: s.display_name,
          class_name: cls?.name ?? null,
          room_number: cls?.room_number ?? null,
        },
        record: recordByStaffId[s.id] ?? null,
      }
    })
    .sort((a, b) => compareNullableText(a.staff.class_name, b.staff.class_name))

  const formattedDate = formatCalendarDate(selectedDate, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="max-w-5xl print:max-w-none">
      <style>{`@page { size: A4 portrait; margin: 10mm; } @media print { a[href]::after { content: none !important; } }`}</style>

      {/* Screen toolbar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Sign-In</h1>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-sm text-gray-500">{formattedDate}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium text-white print:hidden ${selectedDate === today ? 'bg-green-500' : 'bg-amber-500'}`}
            >
              {selectedDate === today
                ? 'Today'
                : selectedDate < today
                  ? 'Historical'
                  : 'Future'}
            </span>
          </div>
        </div>
        <div className="flex items-end gap-3">
          <DatePicker
            selectedDate={selectedDate}
            basePath="/staff-attendance"
          />
          <PrintButton />
        </div>
      </div>

      {/* Screen interactive table */}
      <div className="print:hidden">
        <StaffAttendanceTable
          rows={rows}
          defaultTime={defaultTime}
          date={selectedDate}
          role={role}
          currentStaffId={staffId}
        />
      </div>

      <SignInSheetPrintTable rows={rows} />
    </div>
  )
}
