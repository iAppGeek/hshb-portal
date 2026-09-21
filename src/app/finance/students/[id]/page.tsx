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

  const [detail, plans, yearsHistory] = await Promise.all([
    getStudentFeeDetail(id, yearId),
    getFeePlans(yearId),
    getStudentFeeYears(id),
  ])

  if (!detail) {
    notFound()
  }

  const today = todayInSchoolTz()
  const { student, account, payments, classes } = detail

  // Each other year's plans, so the panel can summarise those years too.
  const otherYearIds = yearsHistory
    .map((yh) => yh.year.id)
    .filter((id) => id !== yearId)
  const plansByYear = Object.fromEntries(
    await Promise.all(
      otherYearIds.map(async (id) => [id, await getFeePlans(id)] as const),
    ),
  )

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

      <StudentFeesPanel
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
