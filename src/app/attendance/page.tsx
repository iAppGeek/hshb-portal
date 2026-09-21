import { Suspense } from 'react'
import { type Metadata } from 'next'

import { requireSession } from '@/auth/require'
import {
  getAcademicYears,
  getAllClasses,
  getClassesByAcademicYear,
  getClassesByTeacher,
  getCurrentAcademicYear,
} from '@/db'
import { resolveYearId } from '@/lib/academicYears'
import { isClassOpen } from '@/lib/classes'
import { todayInSchoolTz } from '@/lib/datetime'
import { isAdmin, isTeacher } from '@/lib/permissions'

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
  const actor = await requireSession()
  const role = actor.role
  const staffId = actor.staffId
  const { classId: qClassId, date: qDate, year: qYear } = await searchParams

  const today = todayInSchoolTz()

  // Admins can browse any academic year; everyone else stays on the current one.
  const admin = isAdmin(role)
  const [years, currentYear] = admin
    ? await Promise.all([getAcademicYears(), getCurrentAcademicYear()])
    : [[], await getCurrentAcademicYear()]
  const selectedYear = admin
    ? (years.find(
        (y) => y.id === resolveYearId(years, qYear, currentYear.id),
      ) ?? currentYear)
    : currentYear
  const isNonCurrentYear = admin && selectedYear.id !== currentYear.id

  // Admins see every class of the selected year, active or not, so a
  // completed current-year class is still visible (read-only). Everyone
  // else sees only what they're allowed to take registers for.
  const classes = isTeacher(role)
    ? await getClassesByTeacher(staffId)
    : admin
      ? await getClassesByAcademicYear(selectedYear.id)
      : await getAllClasses()

  const defaultDate = isNonCurrentYear
    ? today >= selectedYear.start_date && today <= selectedYear.end_date
      ? today
      : selectedYear.end_date
    : today
  const selectedDate = qDate ?? defaultDate

  const requestedClass = qClassId
    ? (classes.find((c) => c.id === qClassId) ?? null)
    : null
  const classUnavailable = Boolean(qClassId) && !requestedClass
  const selectedClass = requestedClass ?? classes[0] ?? null
  const selectedClassId = selectedClass?.id ?? null
  const archived = selectedClass
    ? !isClassOpen(selectedClass, currentYear)
    : false

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Attendance Register
        </h1>
        {admin && (
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
            yearId={admin ? selectedYear.id : undefined}
          />

          {classUnavailable ? (
            <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-200">
              <p className="text-gray-500">
                This class isn&apos;t available. It may have been completed or
                you may not have access.
              </p>
            </div>
          ) : (
            selectedClassId && (
              <Suspense
                key={`${selectedClassId}-${selectedDate}`}
                fallback={<RegisterSkeleton />}
              >
                <AttendanceRegister
                  classId={selectedClassId}
                  date={selectedDate}
                  className={selectedClass?.name ?? selectedClassId}
                  role={role}
                  archived={archived}
                />
              </Suspense>
            )
          )}
        </>
      )}
    </div>
  )
}
