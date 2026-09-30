import { Suspense } from 'react'
import { type Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSession } from '@/auth/require'
import EmailClassDropdown from '@/components/EmailClassDropdown'
import PrintPageSetup from '@/components/grid/PrintPageSetup'
import TableSkeleton from '@/components/grid/TableSkeleton'
import { getClassWithStudents } from '@/db'
import { personName } from '@/lib/format'
import { compareByName } from '@/lib/grid/sort'
import { isTeacher } from '@/lib/permissions'

import PageHeader from '../../_components/PageHeader'
import PrintButton from '../PrintButton'

import ClassRegisterCard, { type RegisterStudent } from './ClassRegisterCard'
import EnrolmentHistoryTable, {
  type EnrolmentHistoryRow,
} from './EnrolmentHistoryTable'

export const metadata: Metadata = { title: 'Class Register' }

type Student = RegisterStudent & {
  secondary_guardian: {
    first_name: string
    last_name: string
    phone: string | null
    email: string | null
  } | null
}

export default async function ClassRegisterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const actor = await requireSession()
  const role = actor.role
  const { id } = await params

  const cls = await getClassWithStudents(id)
  if (!cls) notFound()

  if (isTeacher(role) && cls.teacher_id !== actor.staffId) {
    notFound()
  }

  const teacher = cls.teacher as {
    first_name: string
    last_name: string
    display_name: string | null
    email: string | null
  } | null

  const teacherName = personName(teacher)

  const students = (cls.student_classes as Array<{ student: Student | null }>)
    .map((sc) => sc.student)
    .filter((s): s is Student => s !== null)
    .sort(compareByName)

  const enrolmentHistory = (cls.enrolment_history ??
    []) as EnrolmentHistoryRow[]

  return (
    <div className="max-w-5xl print:max-w-none">
      <PrintPageSetup />
      {/* Screen-only toolbar */}
      <div className="print:hidden">
        <PageHeader
          title={`${cls.name} — Register`}
          backHref="/classes"
          backLabel="Classes"
          action={
            <div className="flex shrink-0 items-center gap-3">
              <EmailClassDropdown
                students={students}
                subject={`${cls.name} — Class register`}
              />
              <PrintButton />
            </div>
          }
        />
      </div>

      {/* Print-only title */}
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-bold">{cls.name} — Class Register</h1>
      </div>

      <ClassRegisterCard
        teacherName={teacherName}
        teacherEmail={teacher?.email ?? null}
        yearGroup={cls.year_group}
        academicYear={cls.academic_year}
        students={students}
        emptyMessage={
          enrolmentHistory.length > 0
            ? 'No current students. See enrolment history below.'
            : 'No students enrolled in this class.'
        }
      />

      <div className="print:hidden">
        <Suspense fallback={<TableSkeleton columns={3} />}>
          <EnrolmentHistoryTable rows={enrolmentHistory} />
        </Suspense>
      </div>
    </div>
  )
}
