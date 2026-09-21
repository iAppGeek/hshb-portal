import { type Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import {
  getAcademicYears,
  getClassById,
  getCurrentAcademicYear,
  getTeachers,
  getStudentsForList,
} from '@/db'
import { isClassOpen } from '@/lib/classes'
import { canEditClasses } from '@/lib/permissions'

import PageHeader, { RequiredFieldsNote } from '../../../_components/PageHeader'
import ClassForm, {
  type ClassFormTeacher,
  type ClassFormStudent,
  type ClassFormData,
} from '../../ClassForm'

import { updateClassAction } from './actions'

export const metadata: Metadata = { title: 'Edit Class' }

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const actor = await requireSession()
  const role = actor.role

  if (!canEditClasses(role)) {
    redirect('/classes')
  }

  const { id } = await params

  const [classData, teachers, students, years, currentYear] = await Promise.all(
    [
      getClassById(id),
      getTeachers(),
      getStudentsForList(),
      getAcademicYears(),
      getCurrentAcademicYear(),
    ],
  )

  if (!classData) {
    notFound()
  }

  if (!isClassOpen(classData, currentYear)) {
    redirect(`/classes/${id}`)
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`Edit Class: ${classData.name}`}
        subtitle={RequiredFieldsNote}
        backHref={`/classes/${id}`}
        backLabel="Class"
      />

      <ClassForm
        teachers={teachers as ClassFormTeacher[]}
        students={students as ClassFormStudent[]}
        years={years}
        classData={classData as ClassFormData}
        action={updateClassAction.bind(null, id)}
        submitLabel="Save changes"
      />
    </div>
  )
}
