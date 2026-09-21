import { type Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getLessonPlanById, getClassesByTeacher } from '@/db'
import { canEditLessonPlans, isTeacher } from '@/lib/permissions'

import PageHeader, { RequiredFieldsNote } from '../../../_components/PageHeader'

import EditLessonPlanForm from './EditLessonPlanForm'

export const metadata: Metadata = { title: 'Edit Lesson Plan' }

export default async function EditLessonPlanPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const actor = await requireSession()
  const role = actor.role
  if (!canEditLessonPlans(role)) redirect('/lesson-plans')

  const { id } = await params
  const plan = await getLessonPlanById(id)
  if (!plan) notFound()

  if (isTeacher(role)) {
    const classes = await getClassesByTeacher(actor.staffId)
    if (!classes.some((c) => c.id === plan.class_id)) {
      notFound()
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Edit Lesson Plan"
        subtitle={RequiredFieldsNote}
        backHref="/lesson-plans"
        backLabel="Lesson Plans"
      />
      <EditLessonPlanForm plan={plan} />
    </div>
  )
}
