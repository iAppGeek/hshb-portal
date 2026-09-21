import { type Metadata } from 'next'

import { requireSession } from '@/auth/require'
import { getLessonPlans, getClassesByTeacher } from '@/db'
import type { LessonPlanRow } from '@/db'
import {
  isTeacher,
  canCreateLessonPlans,
  canEditLessonPlans,
} from '@/lib/permissions'

import LessonPlansClient from './LessonPlansClient'

export const metadata: Metadata = { title: 'Lesson Plans' }

export default async function LessonPlansPage() {
  const actor = await requireSession()
  const role = actor.role
  const staffId = actor.staffId
  const teacherOnly = isTeacher(role)
  const canCreate = canCreateLessonPlans(role)
  const canEdit = canEditLessonPlans(role)

  let lessonPlans: LessonPlanRow[]

  if (teacherOnly) {
    const classes = await getClassesByTeacher(staffId)
    const classIds = classes.map((c) => c.id)
    lessonPlans = await getLessonPlans({ classIds, limit: 50 })
  } else {
    lessonPlans = await getLessonPlans({ limit: 50 })
  }

  return (
    <LessonPlansClient
      lessonPlans={lessonPlans}
      role={role}
      canCreate={canCreate}
      canEdit={canEdit}
    />
  )
}
