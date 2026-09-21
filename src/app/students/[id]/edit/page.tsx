import { type Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getStudentById, getAllGuardians, getAllClasses } from '@/db'
import LeaverBadge from '@/components/LeaverBadge'
import { formatCalendarDate } from '@/lib/datetime'
import { canEditStudents } from '@/lib/permissions'

import PageHeader, { RequiredFieldsNote } from '../../../_components/PageHeader'

import EditStudentForm from './EditStudentForm'
import LeaverSection from './LeaverSection'

export const metadata: Metadata = { title: 'Edit Student' }

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const actor = await requireSession()
  const role = actor.role

  if (!canEditStudents(role)) {
    redirect('/students')
  }

  const { id } = await params

  const [student, guardians, classes] = await Promise.all([
    getStudentById(id),
    getAllGuardians(),
    getAllClasses(),
  ])

  if (!student) {
    notFound()
  }

  const enrolledClassIds = (
    student.student_classes as Array<{ class: { id: string } | null }>
  )
    .map((sc) => sc.class?.id)
    .filter((id): id is string => Boolean(id))

  const leavingDate = (
    student.enrolment_end_dates as Array<{ end_date: string | null }>
  )
    .map((r) => r.end_date)
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1)

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`Edit Student: ${student.last_name}, ${student.first_name}`}
        subtitle={RequiredFieldsNote}
        backHref="/students"
        backLabel="Students"
      />

      {!student.active && (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <LeaverBadge reason={student.leaving_reason} />
          <p className="text-sm text-gray-700">
            {leavingDate
              ? `Left on ${formatCalendarDate(leavingDate)}`
              : 'Left'}
          </p>
        </div>
      )}

      <EditStudentForm
        student={student}
        guardians={guardians}
        classes={
          student.active
            ? (classes as { id: string; name: string; year_group: string }[])
            : undefined
        }
        enrolledClassIds={enrolledClassIds}
      />

      {student.active && canEditStudents(role) && (
        <div className="mt-6">
          <LeaverSection studentId={id} />
        </div>
      )}
    </div>
  )
}
