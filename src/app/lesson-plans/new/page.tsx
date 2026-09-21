import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getAllClasses, getClassesByTeacher } from '@/db'
import { isTeacher, canCreateLessonPlans } from '@/lib/permissions'

import PageHeader, { RequiredFieldsNote } from '../../_components/PageHeader'

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
      <PageHeader
        title="Add Lesson Plan"
        subtitle={RequiredFieldsNote}
        backHref="/lesson-plans"
        backLabel="Lesson Plans"
      />
      <AddLessonPlanForm classes={classes} />
    </div>
  )
}
