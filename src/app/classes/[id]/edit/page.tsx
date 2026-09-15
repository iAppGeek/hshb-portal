import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  getAcademicYears,
  getClassById,
  getCurrentAcademicYear,
  getTeachers,
  getStudentsForList,
} from '@/db'
import { isClassOpen } from '@/lib/classes'
import { canEditClasses } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

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
  const session = await auth()
  const role = session?.user?.role as StaffRole

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
    redirect('/classes')
  }

  if (!isClassOpen(classData, currentYear)) {
    redirect(`/classes/${id}`)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Edit Class: {classData.name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Fields marked with <span className="text-red-500">*</span> are
          required.
        </p>
      </div>

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
