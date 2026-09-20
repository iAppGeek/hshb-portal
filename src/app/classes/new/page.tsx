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

import ClassForm, {
  type ClassFormTeacher,
  type ClassFormStudent,
} from '../ClassForm'

import { createClassAction } from './actions'

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add Class</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fields marked with <span className="text-red-500">*</span> are
          required.
        </p>
      </div>

      <ClassForm
        teachers={teachers as ClassFormTeacher[]}
        students={students as ClassFormStudent[]}
        years={years}
        defaultAcademicYearId={currentYear.id}
        action={createClassAction}
        submitLabel="Add Class"
      />
    </div>
  )
}
