import type { ReactElement } from 'react'

import type { IncidentCounts } from '@/db'
import SimpleGrid from '@/components/grid/SimpleGrid'
import { formatCalendarDate } from '@/lib/datetime'
import type { GridColumn } from '@/lib/grid/columns'

import SectionCard from '../../_components/SectionCard'

import SchoolDaysCard from './SchoolDaysCard'
import type { SchoolDayDate } from './SchoolDaysCard'

export type StaffDaysWorkedRow = {
  name: string
  role: string
  daysWorked: number
  dates: string[]
}

type ClassSummaryRow = {
  name: string
  enrolled: number
  presentCount: number
  absentCount: number
  lateCount: number
  possible: number
}

type Props = {
  staffDaysWorked: StaffDaysWorkedRow[]
  totalSchoolDays: number
  schoolDayDates: SchoolDayDate[]
  classSummary: ClassSummaryRow[]
  incidentCounts: IncidentCounts
}

function formatDateShort(dateStr: string): string {
  const day = formatCalendarDate(dateStr, { weekday: 'short' })
  const match = dateStr.match(/^\d{4}-\d{2}-(\d{2})/)
  const dayOfMonth = match ? Number(match[1]) : ''
  return `${day} ${dayOfMonth}`
}

function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : '—'
}

export default function PeriodReport({
  staffDaysWorked,
  totalSchoolDays,
  schoolDayDates,
  classSummary,
  incidentCounts,
}: Props): ReactElement {
  const staffColumns: GridColumn<StaffDaysWorkedRow>[] = [
    { id: 'name', header: 'Name', primary: true, cell: (row) => row.name },
    {
      id: 'role',
      header: 'Role',
      className: 'capitalize',
      cell: (row) => row.role,
    },
    {
      id: 'days_worked',
      header: 'Days Worked',
      cell: (row) => (
        <>
          <span className="font-medium">
            {row.daysWorked}/{totalSchoolDays}
          </span>{' '}
          <span className="text-gray-400">
            ({pct(row.daysWorked, totalSchoolDays)})
          </span>
        </>
      ),
    },
    {
      id: 'dates_signed_in',
      header: 'Dates Signed In',
      cell: (row) =>
        row.dates.length > 0
          ? row.dates.map((d) => formatDateShort(d)).join(', ')
          : '—',
    },
  ]

  const classColumns: GridColumn<ClassSummaryRow>[] = [
    { id: 'class', header: 'Class', primary: true, cell: (row) => row.name },
    { id: 'enrolled', header: 'Enrolled', cell: (row) => row.enrolled },
    {
      id: 'attendance_rate',
      header: 'Attendance %',
      cell: (row) => (
        <span className="font-medium">
          {pct(row.presentCount, row.possible)}
        </span>
      ),
    },
    { id: 'absences', header: 'Absences', cell: (row) => row.absentCount },
    { id: 'late', header: 'Late', cell: (row) => row.lateCount },
  ]

  return (
    <>
      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SchoolDaysCard
          totalSchoolDays={totalSchoolDays}
          dates={schoolDayDates}
        />
        <div className="group relative rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-6">
          <p className="text-sm text-gray-500">Incidents</p>
          <p className="mt-1 flex items-center gap-2">
            <span className="text-3xl font-bold text-gray-900">
              {incidentCounts.total}
            </span>
          </p>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
          >
            Medical, behaviour &amp; other incidents in period
          </span>
        </div>
      </div>

      {/* Incidents summary */}
      {incidentCounts.total > 0 && (
        <div className="mb-8 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700">
            {incidentCounts.total} incident
            {incidentCounts.total !== 1 ? 's' : ''}
          </span>
          {incidentCounts.medical > 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-800">
              {incidentCounts.medical} medical
            </span>
          )}
          {incidentCounts.behaviour > 0 && (
            <span className="rounded-full bg-yellow-100 px-3 py-1 font-medium text-yellow-800">
              {incidentCounts.behaviour} behaviour
            </span>
          )}
          {incidentCounts.other > 0 && (
            <span className="rounded-full bg-blue-100 px-3 py-1 font-medium text-blue-800">
              {incidentCounts.other} other
            </span>
          )}
        </div>
      )}

      {/* Staff Days Worked */}
      <div className="mb-8">
        <SectionCard title="Staff Days Worked">
          <SimpleGrid
            columns={staffColumns}
            rows={staffDaysWorked}
            getRowKey={(row) => row.name}
            frame="none"
            emptyMessage="No staff attendance data for this period"
          />
        </SectionCard>
      </div>

      {/* Attendance Summary by Class */}
      <SectionCard title="Attendance Summary by Class">
        <SimpleGrid
          columns={classColumns}
          rows={classSummary}
          getRowKey={(row) => row.name}
          frame="none"
          emptyMessage="No attendance data for this period"
        />
      </SectionCard>
    </>
  )
}
