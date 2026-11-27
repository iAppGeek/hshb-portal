import { type ReactElement } from 'react'
import Link from 'next/link'
import {
  UsersIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  AcademicCapIcon,
  InboxIcon,
} from '@heroicons/react/24/outline'

import { getDashboardStats } from '@/db'
import { linktreeUrlFor } from '@/lib/linktree'
import { canManageHr, isTeacher } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import HrComplianceTile from './HrComplianceTile'
import LinktreeTile from './LinktreeTile'
import MyHrDataTile from './MyHrDataTile'

const pct = (n: number, total: number) =>
  total > 0 ? `${Math.round((n / total) * 100)}%` : '—'

export function StatCardsSkeleton(): ReactElement {
  return (
    <div
      className="grid animate-pulse grid-cols-2 gap-3 sm:gap-5"
      aria-hidden="true"
    >
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="xs:flex-row xs:items-center xs:gap-3 flex flex-col items-start gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:gap-4 sm:p-6"
        >
          <div className="h-9 w-9 rounded-lg bg-gray-200 sm:h-12 sm:w-12" />
          <div className="flex-1">
            <div className="h-3 w-20 rounded bg-gray-200" />
            <div className="mt-2 h-6 w-10 rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default async function DashboardStats({
  role,
  staffId,
  email,
  today,
}: {
  role: StaffRole
  staffId: string
  email: string
  today: string
}): Promise<ReactElement> {
  const teacherOnly = isTeacher(role)
  const {
    studentCount,
    classCount,
    teacherCount,
    incidentCount,
    lessonPlansToday,
    presentToday,
    enrolledToday,
    registersTakenToday,
    pendingRegistrationCount,
  } = await getDashboardStats({ role, staffId }, today)

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5">
      {/* Row 1: Students */}
      {!teacherOnly && (
        <Link
          href="/attendance"
          className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md sm:p-6"
        >
          <p className="text-sm text-gray-500">Students attendance today</p>
          <p className="mt-1 flex items-center gap-2">
            <span className="text-3xl font-bold text-gray-900">
              {presentToday}/{enrolledToday}
            </span>
            <span className="text-sm font-medium text-gray-500">
              {pct(presentToday ?? 0, enrolledToday ?? 0)}
            </span>
          </p>
        </Link>
      )}

      <Link
        href="/students"
        className="group xs:flex-row xs:items-center xs:gap-3 flex flex-col items-start gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md sm:gap-4 sm:p-6"
      >
        <div className="rounded-lg bg-blue-50 p-2 transition group-hover:bg-blue-100 sm:p-3">
          <UsersIcon className="h-5 w-5 text-blue-600 sm:h-6 sm:w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">
            {teacherOnly ? 'My Students' : 'Total Students'}
          </p>
          <p className="mt-0.5 text-2xl font-bold text-gray-900">
            {studentCount}
          </p>
        </div>
      </Link>

      {/* Row 2: Classes */}
      {!teacherOnly && (
        <Link
          href="/attendance"
          className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md sm:p-6"
        >
          <p className="text-sm text-gray-500">Attendance submitted today</p>
          <p className="mt-1 flex items-center gap-2">
            <span className="text-3xl font-bold text-gray-900">
              {registersTakenToday}/{classCount}
            </span>
            <span className="text-sm font-medium text-gray-500">
              {pct(registersTakenToday ?? 0, classCount)}
            </span>
          </p>
        </Link>
      )}

      <Link
        href="/classes"
        className="group xs:flex-row xs:items-center xs:gap-3 flex flex-col items-start gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md sm:gap-4 sm:p-6"
      >
        <div className="rounded-lg bg-blue-50 p-2 transition group-hover:bg-blue-100 sm:p-3">
          <CalendarDaysIcon className="h-5 w-5 text-blue-600 sm:h-6 sm:w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">
            {teacherOnly ? 'My Classes' : 'Total Classes'}
          </p>
          <p className="mt-0.5 text-2xl font-bold text-gray-900">
            {classCount}
          </p>
        </div>
      </Link>

      {/* Row 3: Teachers */}
      {!teacherOnly && (
        <Link
          href="/staff"
          className="group xs:flex-row xs:items-center xs:gap-3 flex flex-col items-start gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md sm:gap-4 sm:p-6"
        >
          <div className="rounded-lg bg-blue-50 p-2 transition group-hover:bg-blue-100 sm:p-3">
            <AcademicCapIcon className="h-5 w-5 text-blue-600 sm:h-6 sm:w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Teachers</p>
            <p className="mt-0.5 text-2xl font-bold text-gray-900">
              {teacherCount}
            </p>
          </div>
        </Link>
      )}

      {/* Row 4: Lesson Plans / Incidents */}
      {!teacherOnly && (
        <>
          <Link
            href="/lesson-plans"
            className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md sm:p-6"
          >
            <p className="flex items-center gap-1 text-sm text-gray-500">
              Lessons planned today
              <span
                title="Number of lesson plans submitted today as a percentage of total active classes"
                className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-gray-100 text-xs text-gray-400"
              >
                ?
              </span>
            </p>
            <p className="mt-1 flex items-center gap-2">
              <span className="text-3xl font-bold text-gray-900">
                {lessonPlansToday}/{classCount}
              </span>
              <span className="text-sm font-medium text-gray-500">
                {pct(lessonPlansToday ?? 0, classCount)}
              </span>
            </p>
          </Link>

          <Link
            href="/incidents"
            className="group xs:flex-row xs:items-center xs:gap-3 flex flex-col items-start gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md sm:gap-4 sm:p-6"
          >
            <div className="rounded-lg bg-blue-50 p-2 transition group-hover:bg-blue-100 sm:p-3">
              <ExclamationTriangleIcon className="h-5 w-5 text-blue-600 sm:h-6 sm:w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">
                Total Incidents
              </p>
              <p className="mt-0.5 text-2xl font-bold text-gray-900">
                {incidentCount}
              </p>
            </div>
          </Link>
        </>
      )}

      {pendingRegistrationCount !== null && (
        <Link
          href="/registrations"
          className="group xs:flex-row xs:items-center xs:gap-3 flex flex-col items-start gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md sm:gap-4 sm:p-6"
        >
          <div className="rounded-lg bg-blue-50 p-2 transition group-hover:bg-blue-100 sm:p-3">
            <InboxIcon className="h-5 w-5 text-blue-600 sm:h-6 sm:w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">
              Pending registrations
            </p>
            <p className="mt-0.5 text-2xl font-bold text-gray-900">
              {pendingRegistrationCount}
            </p>
          </div>
        </Link>
      )}

      {canManageHr(role) && <HrComplianceTile today={today} />}

      <MyHrDataTile staffId={staffId} today={today} />

      <LinktreeTile url={linktreeUrlFor(email)} />
    </div>
  )
}
