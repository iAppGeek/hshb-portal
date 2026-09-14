import { Suspense } from 'react'
import { type Metadata } from 'next'

import { auth } from '@/auth'
import {
  getAcademicYears,
  getAllClasses,
  getClassesByAcademicYear,
  getClassesByTeacher,
  getCurrentAcademicYear,
} from '@/db'
import { resolveYearId } from '@/lib/academicYears'
import { todayInSchoolTz } from '@/lib/datetime'
import { isAdmin, isTeacher } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import YearSelector from '../_components/YearSelector'

import AttendanceFilters from './AttendanceFilters'
import AttendanceRegister from './AttendanceRegister'

export const metadata: Metadata = { title: 'Attendance' }

function RegisterSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 h-4 w-48 rounded bg-gray-200" />
      <div className="mb-4 flex gap-4">
        <div className="h-7 w-24 rounded-full bg-gray-200" />
        <div className="h-7 w-20 rounded-full bg-gray-200" />
        <div className="h-7 w-20 rounded-full bg-gray-200" />
      </div>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
          <div className="flex gap-4">
            <div className="h-3 w-20 rounded bg-gray-200" />
            <div className="h-3 w-14 rounded bg-gray-200" />
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b border-gray-100 px-6 py-4 last:border-0"
          >
            <div className="h-4 w-40 rounded bg-gray-200" />
            <div className="flex gap-2">
              <div className="h-7 w-20 rounded-full bg-gray-200" />
              <div className="h-7 w-14 rounded-full bg-gray-200" />
              <div className="h-7 w-20 rounded-full bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 h-9 w-32 rounded-lg bg-gray-200" />
    </div>
  )
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string; year?: string }>
}) {
  const session = await auth()
  const role = session?.user?.role as StaffRole
  const staffId = session?.user?.staffId ?? ''
  const { classId: qClassId, date: qDate, year: qYear } = await searchParams

  const today = todayInSchoolTz()

  // Admins can browse any academic year; everyone else stays on the current one.
  const admin = isAdmin(role)
  const [years, currentYear] = admin
    ? await Promise.all([getAcademicYears(), getCurrentAcademicYear()])
    : [[], null]
  const selectedYear = currentYear
    ? (years.find(
        (y) => y.id === resolveYearId(years, qYear, currentYear.id),
      ) ?? currentYear)
    : null
  // The current year lists active classes. Another year lists all of its
  // classes, since a completed class is inactive, and its registers are
  // read-only.
  const isNonCurrentYear = Boolean(
    selectedYear && currentYear && selectedYear.id !== currentYear.id,
  )

  const classes = isTeacher(role)
    ? await getClassesByTeacher(staffId)
    : isNonCurrentYear && selectedYear
      ? await getClassesByAcademicYear(selectedYear.id)
      : await getAllClasses()

  const defaultDate =
    isNonCurrentYear && selectedYear
      ? today >= selectedYear.start_date && today <= selectedYear.end_date
        ? today
        : selectedYear.end_date
      : today
  const selectedDate = qDate ?? defaultDate

  const selectedClass =
    classes.find((c) => c.id === qClassId) ?? classes[0] ?? null
  const selectedClassId = selectedClass?.id ?? null

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Attendance Register
        </h1>
        {admin && selectedYear && (
          <YearSelector
            years={years}
            value={selectedYear.id}
            basePath="/attendance"
          />
        )}
      </div>

      {classes.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-200">
          <p className="text-gray-500">No classes assigned.</p>
        </div>
      ) : (
        <>
          <AttendanceFilters
            classes={classes}
            selectedClassId={selectedClassId}
            selectedDate={selectedDate}
            yearId={admin ? selectedYear?.id : undefined}
          />

          {selectedClassId && (
            <Suspense
              key={`${selectedClassId}-${selectedDate}`}
              fallback={<RegisterSkeleton />}
            >
              <AttendanceRegister
                classId={selectedClassId}
                date={selectedDate}
                className={selectedClass?.name ?? selectedClassId}
                role={role}
                archived={isNonCurrentYear}
              />
            </Suspense>
          )}
        </>
      )}
    </div>
  )
}
