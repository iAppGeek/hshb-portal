import { type Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getLessonPlanById, getClassesByTeacher } from '@/db'
import DefinitionList from '@/components/DefinitionList'
import PermissionedLink from '@/components/PermissionedLink'
import { formatCalendarDate, formatDateTimeInSchoolTz } from '@/lib/datetime'
import { personName } from '@/lib/format'
import { canEditLessonPlans, isTeacher } from '@/lib/permissions'

import PageHeader from '../../_components/PageHeader'

export const metadata: Metadata = { title: 'Lesson Plan' }

export default async function LessonPlanPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactElement> {
  const actor = await requireSession()
  const role = actor.role
  const canEdit = canEditLessonPlans(role)

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
        title={`${plan.class.name} — ${formatCalendarDate(plan.lesson_date)}`}
        backHref="/lesson-plans"
        backLabel="Lesson Plans"
        action={
          <PermissionedLink
            href={`/lesson-plans/${plan.id}/edit`}
            allowed={canEdit}
            showDisabled={!isTeacher(role)}
            disabledReason="You don't have permission to edit lesson plans"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            Edit
          </PermissionedLink>
        }
      />

      <DefinitionList
        items={[
          { label: 'Lesson date', value: formatCalendarDate(plan.lesson_date) },
          { label: 'Class', value: plan.class.name },
          { label: 'Description', value: plan.description },
          { label: 'Created by', value: personName(plan.creator) },
          {
            label: 'Created at',
            value: formatDateTimeInSchoolTz(plan.created_at),
          },
          ...(plan.updater
            ? [
                { label: 'Last updated by', value: personName(plan.updater) },
                {
                  label: 'Last updated at',
                  value: formatDateTimeInSchoolTz(plan.updated_at),
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}
