import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getAllClasses, getClassesByTeacher } from '@/db'
import { isTeacher, canCreateLessonPlans } from '@/lib/permissions'

import AddLessonPlanForm from './AddLessonPlanForm'

export const metadata: Metadata = { title: 'Add Lesson Plan' }

export default async function AddLessonPlanPage() {
  const actor = await requireSession()
  const role = actor.role
  if (!canCreateLessonPlans(role)) redirect('/lesson-plans')

  const staffId = actor.staffId
  const classes = isTeacher(role)
    ? await getClassesByTeacher(staffId)
    : await getAllClasses()

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add Lesson Plan</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fields marked with <span className="text-red-500">*</span> are
          required.
        </p>
      </div>
      <AddLessonPlanForm classes={classes} />
    </div>
  )
}
