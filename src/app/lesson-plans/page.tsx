import { type Metadata } from 'next'
import Link from 'next/link'

import { requireSession } from '@/auth/require'
import { getLessonPlans, getClassesByTeacher } from '@/db'
import type { LessonPlanRow } from '@/db'
import SimpleGrid from '@/components/grid/SimpleGrid'
import PermissionedLink from '@/components/PermissionedLink'
import { formatCalendarDate } from '@/lib/datetime'
import type { GridColumn, StackedRowSpec } from '@/lib/grid/columns'
import { personName } from '@/lib/format'
import {
  isTeacher,
  canCreateLessonPlans,
  canEditLessonPlans,
} from '@/lib/permissions'

import PageHeader from '../_components/PageHeader'

export const metadata: Metadata = { title: 'Lesson Plans' }

export default async function LessonPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>
}): Promise<React.ReactElement> {
  const actor = await requireSession()
  const role = actor.role
  const staffId = actor.staffId
  const teacherOnly = isTeacher(role)
  const canCreate = canCreateLessonPlans(role)
  const canEdit = canEditLessonPlans(role)
  const { classId } = await searchParams

  let lessonPlans: LessonPlanRow[]
  if (teacherOnly) {
    const classes = await getClassesByTeacher(staffId)
    const classIds = classId
      ? classes.filter((c) => c.id === classId).map((c) => c.id)
      : classes.map((c) => c.id)
    lessonPlans = await getLessonPlans({ classIds, limit: 50 })
  } else {
    lessonPlans = await getLessonPlans({ classId, limit: 50 })
  }

  const columns: GridColumn<LessonPlanRow>[] = [
    {
      id: 'lesson_date',
      header: 'Lesson date',
      dark: true,
      className: 'whitespace-nowrap',
      cell: (plan) => formatCalendarDate(plan.lesson_date),
    },
    {
      id: 'class',
      header: 'Class',
      primary: true,
      className: 'whitespace-nowrap',
      cell: (plan) => plan.class.name,
    },
    {
      id: 'description',
      header: 'Description',
      cell: (plan) => (
        <span className="line-clamp-1 max-w-xs">{plan.description}</span>
      ),
    },
    {
      id: 'created_by',
      header: 'Created by',
      className: 'whitespace-nowrap',
      cell: (plan) => personName(plan.creator),
    },
    {
      id: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      className: 'whitespace-nowrap font-medium',
      cell: (plan) => (
        <div className="flex items-center justify-end gap-3">
          <PermissionedLink
            href={`/lesson-plans/${plan.id}/edit`}
            allowed={canEdit}
            showDisabled={!teacherOnly}
            disabledReason="You don't have permission to edit lesson plans"
          >
            Edit
          </PermissionedLink>
          <Link
            href={`/lesson-plans/${plan.id}`}
            className="text-gray-500 hover:text-gray-700"
          >
            View
          </Link>
        </div>
      ),
    },
  ]

  const stacked: StackedRowSpec<LessonPlanRow> = {
    title: (plan) => plan.class.name,
    titleAside: (plan) => (
      <PermissionedLink
        href={`/lesson-plans/${plan.id}/edit`}
        allowed={canEdit}
        showDisabled={!teacherOnly}
        disabledReason="You don't have permission to edit lesson plans"
        className="text-xs font-medium text-blue-600 hover:text-blue-800"
      >
        Edit
      </PermissionedLink>
    ),
    details: (plan) => [formatCalendarDate(plan.lesson_date), plan.description],
    detailsAside: (plan) => (
      <Link
        href={`/lesson-plans/${plan.id}`}
        className="shrink-0 text-sm text-gray-500 hover:text-gray-700"
      >
        View
      </Link>
    ),
  }

  return (
    <div>
      <PageHeader
        title="Lesson Plans"
        action={
          canCreate && (
            <Link
              href="/lesson-plans/new"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
            >
              Add lesson plan
            </Link>
          )
        }
      />

      {teacherOnly && (
        <p className="mb-4 text-sm text-gray-500">
          You can only view and create lesson plans for your class.
        </p>
      )}

      <SimpleGrid
        columns={columns}
        rows={lessonPlans}
        getRowKey={(plan) => plan.id}
        mobile="stacked"
        stacked={stacked}
        emptyMessage="No lesson plans found."
      />
    </div>
  )
}
