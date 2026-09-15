import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  formatCalendarDate,
  formatTimeInSchoolTz,
  todayInSchoolTz,
} from '@/lib/datetime'
import { summariseAttendance } from '@/lib/attendanceSummary'
import { canAccessReports, isTeachingStaff } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'
import {
  getAllStaff,
  getStaffSignedInCount,
  getStaffAttendanceByDateRange,
  getAttendanceByDateRange,
  getEnrolmentsInRange,
  getIncidentCountsByDateRange,
} from '@/db'

import ReportsModeSelector from './_components/ReportsModeSelector'
import type { ReportMode } from './_components/ReportsModeSelector'
import DayReport from './_components/DayReport'
import PeriodReport from './_components/PeriodReport'
import type { StaffDaysWorkedRow } from './_components/PeriodReport'

export const metadata: Metadata = { title: 'Reports' }

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string
    date?: string
    month?: string
    from?: string
    to?: string
  }>
}) {
  const session = await auth()
  const role = session?.user?.role as StaffRole | undefined
  if (!session || !role || !canAccessReports(role)) {
    redirect('/dashboard')
  }

  const today = todayInSchoolTz()
  const params = await searchParams

  const mode: ReportMode =
    params.mode === 'month' || params.mode === 'range' ? params.mode : 'day'

  // Derive date params for each mode
  const selectedDate = params.date ?? today
  const selectedMonth = params.month ?? today.slice(0, 7)
  const [yearNum, monthNum] = selectedMonth.split('-').map(Number)
  const monthStart = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`
  const monthEnd = new Date(Date.UTC(yearNum, monthNum, 0))
    .toISOString()
    .split('T')[0]

  const todayAtNoonUtc = new Date(`${today}T12:00:00Z`)
  todayAtNoonUtc.setUTCDate(todayAtNoonUtc.getUTCDate() - 7)
  const sevenDaysAgo = todayAtNoonUtc.toISOString().split('T')[0]
  const rangeFrom = params.from ?? sevenDaysAgo
  const rangeTo = params.to ?? today

  // Selector props
  const selectorProps = {
    mode,
    date: selectedDate,
    month: selectedMonth,
    from: rangeFrom,
    to: rangeTo,
  }

  // Build heading subtitle
  let subtitle: string
  let badgeLabel: string | null = null
  let badgeColor = 'bg-amber-500'

  if (mode === 'day') {
    subtitle = formatCalendarDate(selectedDate, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    if (selectedDate === today) {
      badgeLabel = 'Today'
      badgeColor = 'bg-green-500'
    } else if (selectedDate < today) {
      badgeLabel = 'Historical'
    } else {
      badgeLabel = 'Future'
    }
  } else if (mode === 'month') {
    subtitle = formatCalendarDate(monthStart, {
      month: 'long',
      year: 'numeric',
    })
  } else {
    const fmtShort = (d: string) =>
      formatCalendarDate(d, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    subtitle = `${fmtShort(rangeFrom)} – ${fmtShort(rangeTo)}`
  }

  // ── Day mode ───────────────────────────────────────────────────────────────
  if (mode === 'day') {
    const [staff, staffSignedInCount, attendanceRows, enrolments] =
      await Promise.all([
        getAllStaff(),
        getStaffSignedInCount(selectedDate),
        getAttendanceByDateRange(selectedDate, selectedDate),
        getEnrolmentsInRange(selectedDate, selectedDate),
      ])

    const teachingStaff = staff.filter((s) =>
      isTeachingStaff(s.role as StaffRole),
    )

    const summary = summariseAttendance(attendanceRows, enrolments, [
      selectedDate,
    ])
    const totals = summary.byDate[selectedDate]
    const showYearCode =
      new Set(summary.classes.map((c) => c.class.yearCode)).size > 1

    const enrolmentByClass = summary.classes.map((cls) => ({
      name: showYearCode
        ? `${cls.class.name} (${cls.class.yearCode})`
        : cls.class.name,
      enrolled: cls.enrolled,
      presentCount: cls.firstRecordedAt ? cls.present : null,
      attendanceCreatedAt: cls.firstRecordedAt
        ? formatTimeInSchoolTz(cls.firstRecordedAt)
        : null,
      attendanceUpdatedAt: cls.lastUpdatedAt
        ? formatTimeInSchoolTz(cls.lastUpdatedAt)
        : null,
    }))

    const pct = (n: number, total: number) =>
      total > 0 ? `${Math.round((n / total) * 100)}%` : '—'

    const stats = [
      {
        label: 'Staff signed in',
        value: `${staffSignedInCount}/${teachingStaff.length}`,
        sub: pct(staffSignedInCount, teachingStaff.length),
      },
      {
        label: 'Students attendance',
        value: `${totals.distinctPresent}/${totals.distinctEnrolled}`,
        sub: pct(totals.distinctPresent, totals.distinctEnrolled),
      },
      {
        label: 'Students late',
        value: totals.distinctLate,
        sub: null,
      },
    ]

    return (
      <>
        <PageHeader
          subtitle={subtitle}
          badgeLabel={badgeLabel}
          badgeColor={badgeColor}
          selector={<ReportsModeSelector {...selectorProps} />}
        />
        <DayReport stats={stats} enrolmentByClass={enrolmentByClass} />
      </>
    )
  }

  // ── Month / Range mode ─────────────────────────────────────────────────────
  const startDate = mode === 'month' ? monthStart : rangeFrom
  const endDate = mode === 'month' ? monthEnd : rangeTo

  const [
    staffAttendanceRows,
    attendanceRows,
    enrolments,
    staff,
    incidentCounts,
  ] = await Promise.all([
    getStaffAttendanceByDateRange(startDate, endDate),
    getAttendanceByDateRange(startDate, endDate),
    getEnrolmentsInRange(startDate, endDate),
    getAllStaff(),
    getIncidentCountsByDateRange(startDate, endDate),
  ])

  // Staff days worked
  const staffAttendanceMap = new Map<string, Set<string>>()
  for (const row of staffAttendanceRows) {
    if (!staffAttendanceMap.has(row.staff_id)) {
      staffAttendanceMap.set(row.staff_id, new Set())
    }
    staffAttendanceMap.get(row.staff_id)!.add(row.date)
  }

  // School days = any date where staff signed in OR attendance was taken
  const schoolDayDatesSet = new Set([
    ...staffAttendanceRows.map((r) => r.date),
    ...attendanceRows.map((r) => r.date),
  ])
  const totalSchoolDays = schoolDayDatesSet.size

  // Per-date record counts
  const staffCountByDate = new Map<string, number>()
  for (const row of staffAttendanceRows) {
    staffCountByDate.set(row.date, (staffCountByDate.get(row.date) ?? 0) + 1)
  }
  const attendanceCountByDate = new Map<string, number>()
  for (const row of attendanceRows) {
    attendanceCountByDate.set(
      row.date,
      (attendanceCountByDate.get(row.date) ?? 0) + 1,
    )
  }

  const schoolDayDates = [...schoolDayDatesSet].sort().map((date) => ({
    date,
    staffCount: staffCountByDate.get(date) ?? 0,
    attendanceCount: attendanceCountByDate.get(date) ?? 0,
  }))

  const teachingStaff = staff.filter((s) =>
    isTeachingStaff(s.role as StaffRole),
  )

  const staffDaysWorked: StaffDaysWorkedRow[] = teachingStaff
    .map((s) => ({
      name: s.display_name ?? `${s.first_name} ${s.last_name}`,
      role: s.role,
      daysWorked: staffAttendanceMap.get(s.id)?.size ?? 0,
      dates: [...(staffAttendanceMap.get(s.id) ?? [])].sort(),
    }))
    .sort((a, b) => b.daysWorked - a.daysWorked)

  // Per-class attendance. Untaken registers count as absences against
  // possible attendance (decision 7), so possible comes from enrolment, not
  // marks.
  const summary = summariseAttendance(
    attendanceRows,
    enrolments,
    schoolDayDates.map((d) => d.date),
  )
  const showYearCode =
    new Set(summary.classes.map((c) => c.class.yearCode)).size > 1

  const classSummary = summary.classes.map((cls) => ({
    name: showYearCode
      ? `${cls.class.name} (${cls.class.yearCode})`
      : cls.class.name,
    enrolled: cls.enrolled,
    presentCount: cls.present,
    absentCount: cls.absent,
    lateCount: cls.late,
    possible: cls.possible,
  }))

  return (
    <>
      <PageHeader
        subtitle={subtitle}
        badgeLabel={badgeLabel}
        badgeColor={badgeColor}
        selector={<ReportsModeSelector {...selectorProps} />}
      />
      <PeriodReport
        staffDaysWorked={staffDaysWorked}
        totalSchoolDays={totalSchoolDays}
        schoolDayDates={schoolDayDates}
        classSummary={classSummary}
        incidentCounts={incidentCounts}
      />
    </>
  )
}

// ── Shared header ────────────────────────────────────────────────────────────

function PageHeader({
  subtitle,
  badgeLabel,
  badgeColor,
  selector,
}: {
  subtitle: string
  badgeLabel: string | null
  badgeColor: string
  selector: React.ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Reports &amp; Analytics
        </h1>
        <div className="mt-1 flex items-center gap-2">
          <p className="text-sm text-gray-500">{subtitle}</p>
          {badgeLabel && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium text-white print:hidden ${badgeColor}`}
            >
              {badgeLabel}
            </span>
          )}
        </div>
      </div>
      <div className="print:hidden">{selector}</div>
    </div>
  )
}
