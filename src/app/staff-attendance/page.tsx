import { type Metadata } from 'next'

import { requireSession } from '@/auth/require'
import DatePicker from '@/components/DatePicker'
import PrintPageSetup from '@/components/grid/PrintPageSetup'
import {
  getAllClasses,
  getAllStaff,
  getStaffAttendanceByDate,
  getStaffAttendanceForToday,
} from '@/db'
import {
  defaultSignInTimeFor,
  formatCalendarDate,
  nowTimeInSchoolTz,
  todayInSchoolTz,
} from '@/lib/datetime'
import { compareNullableText } from '@/lib/grid/sort'
import { isTeacher, showsOnSignInSheet } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import PageHeader from '../_components/PageHeader'

import PrintButton from './PrintButton'
import StaffAttendanceTable from './StaffAttendanceTable'

export const metadata: Metadata = { title: 'Staff Sign-In' }

export default async function StaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const actor = await requireSession()
  const role = actor.role
  const staffId = actor.staffId

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
      first_name: actor.name?.split(' ')[0] ?? '',
      last_name: actor.name?.split(' ').slice(1).join(' ') ?? '',
      display_name: actor.name ?? null,
      class_name: myClass?.name ?? null,
      room_number: myClass?.room_number ?? null,
    }

    return (
      <div>
        <PageHeader title="Your Attendance Today" />
        <StaffAttendanceTable
          rows={[{ staff: staffRow, record }]}
          defaultTime={currentTime}
          date={today}
          today={today}
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
  const defaultTime = isToday ? currentTime : defaultSignInTimeFor(selectedDate)

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
      <div className="print:hidden">
        <PageHeader
          title="Staff Sign-In"
          subtitle={formattedDate}
          action={
            <div className="flex items-end gap-3">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${selectedDate === today ? 'bg-green-500' : 'bg-amber-500'}`}
              >
                {selectedDate === today
                  ? 'Today'
                  : selectedDate < today
                    ? 'Historical'
                    : 'Future'}
              </span>
              <DatePicker
                selectedDate={selectedDate}
                basePath="/staff-attendance"
              />
              <PrintButton />
            </div>
          }
        />
      </div>

      {/* Screen table, plus the print-only sheet from the same saved rows */}
      <StaffAttendanceTable
        key={selectedDate}
        rows={rows}
        defaultTime={defaultTime}
        date={selectedDate}
        today={today}
        role={role}
        currentStaffId={staffId}
        withPrintSheet
      />
    </div>
  )
}
