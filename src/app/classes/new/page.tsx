import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import {
  getAcademicYears,
  getCurrentAcademicYear,
  getTeachers,
  getStudentsForList,
} from '@/db'
import { canCreateClasses } from '@/lib/permissions'

import PageHeader, { RequiredFieldsNote } from '../../_components/PageHeader'
import { saveClassAction } from '../actions'
import ClassForm, {
  type ClassFormTeacher,
  type ClassFormStudent,
} from '../ClassForm'

export const metadata: Metadata = { title: 'Add Class' }

export default async function AddClassPage() {
  const actor = await requireSession()
  const role = actor.role

  if (!canCreateClasses(role)) {
    redirect('/classes')
  }

  const [teachers, students, years, currentYear] = await Promise.all([
    getTeachers(),
    getStudentsForList(),
    getAcademicYears(),
    getCurrentAcademicYear(),
  ])

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Add Class"
        subtitle={RequiredFieldsNote}
        backHref="/classes"
        backLabel="Classes"
      />

      <ClassForm
        teachers={teachers as ClassFormTeacher[]}
        students={students as ClassFormStudent[]}
        years={years}
        defaultAcademicYearId={currentYear.id}
        action={saveClassAction.bind(null, null)}
        submitLabel="Add Class"
      />
    </div>
  )
}
