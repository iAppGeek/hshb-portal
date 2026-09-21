import { type Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireRouteAccess } from '@/auth/require'
import {
  getAcademicYears,
  getCurrentAcademicYear,
  getFeePlans,
  getStudentFeeDetail,
  getStudentFeeYears,
} from '@/db'
import type { FeePlanWithClasses } from '@/db'
import { resolveYearId } from '@/lib/academicYears'
import { todayInSchoolTz } from '@/lib/datetime'
import LeaverBadge from '@/components/LeaverBadge'

import PageHeader from '../../../_components/PageHeader'
import YearSelector from '../../../_components/YearSelector'

import StudentFeesPanel from './StudentFeesPanel'
import {
  addStudentPaymentAction,
  deleteStudentPaymentAction,
  saveStudentFeeAccountAction,
} from './actions'

export const metadata: Metadata = { title: 'Student Fees' }

export default async function StudentFeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ year?: string }>
}): Promise<React.ReactElement> {
  await requireRouteAccess('/finance')

  const { id } = await params
  const { year } = await searchParams
  const [years, currentYear] = await Promise.all([
    getAcademicYears(),
    getCurrentAcademicYear(),
  ])
  const yearId = resolveYearId(years, year, currentYear.id)

  // Every year's plans in one read: the panel summarises the student's other
  // years as well as the one on screen.
  const [detail, allPlans, yearsHistory] = await Promise.all([
    getStudentFeeDetail(id, yearId),
    getFeePlans(),
    getStudentFeeYears(id),
  ])

  if (!detail) {
    notFound()
  }

  const today = todayInSchoolTz()
  const { student, account, payments, classes } = detail

  const plansByYear: Record<string, FeePlanWithClasses[]> = {}
  for (const plan of allPlans) {
    const yearPlans = plansByYear[plan.academic_year.id] ?? []
    yearPlans.push(plan)
    plansByYear[plan.academic_year.id] = yearPlans
  }
  const plans = plansByYear[yearId] ?? []

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {student.last_name}, {student.first_name}
            {!student.active && <LeaverBadge reason={student.leaving_reason} />}
          </span>
        }
        subtitle={
          [student.student_code, classes.map((c) => c.name).join(', ')]
            .filter(Boolean)
            .join(' · ') || 'No classes this year'
        }
        backHref={`/finance?tab=students&year=${yearId}`}
        backLabel="Student fees"
        action={
          <YearSelector
            years={years}
            value={yearId}
            basePath={`/finance/students/${student.id}`}
          />
        }
      />

      {/* Keyed on the year: the panel copies the account and payments into
          state, and ?year= changes don't remount the page. */}
      <StudentFeesPanel
        key={yearId}
        studentId={student.id}
        yearId={yearId}
        today={today}
        years={years}
        classes={classes}
        plans={plans}
        plansByYear={plansByYear}
        initialAccount={account}
        initialPayments={payments}
        initialHistory={yearsHistory}
        saveAccountAction={saveStudentFeeAccountAction.bind(null, student.id)}
        addPaymentAction={addStudentPaymentAction.bind(null, student.id)}
        deletePaymentAction={deleteStudentPaymentAction.bind(null, student.id)}
      />
    </div>
  )
}
