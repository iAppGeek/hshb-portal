'use server'

import {
  createAcademicYear,
  updateAcademicYear,
  setCurrentAcademicYear,
} from '@/db'
import { runAction, type ActionResult } from '@/lib/action'
import { canAccessAdminTasks } from '@/lib/permissions'
import { academicYearSchema, academicYearDatesSchema } from '@/lib/schemas'

export async function createAcademicYearAction(
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'admin.academic-years.create',
    permission: canAccessAdminTasks,
    schema: academicYearSchema,
    formData,
    run: (input) => createAcademicYear(input),
    audit: {
      entity: 'academic_year',
      action: 'create',
      entityId: (year) => year.id,
    },
    redirectTo: '/admin?tab=academic-years',
    fallbackError: 'Failed to create academic year. Please try again.',
  })
}

export async function updateAcademicYearAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'admin.academic-years.update',
    permission: canAccessAdminTasks,
    schema: academicYearDatesSchema,
    formData,
    run: (input) => updateAcademicYear(id, input),
    audit: { entity: 'academic_year', action: 'update', entityId: () => id },
    redirectTo: '/admin?tab=academic-years',
    fallbackError: 'Failed to update academic year. Please try again.',
  })
}

/** Stays on the tab: returns the new current year's id for the table to show. */
export async function setCurrentAcademicYearAction(
  id: string,
  previousId: string | null,
): Promise<ActionResult<{ currentId: string }>> {
  return runAction({
    name: 'admin.academic-years.set-current',
    permission: canAccessAdminTasks,
    formData: new FormData(),
    run: async () => {
      await setCurrentAcademicYear(id)
      return { currentId: id }
    },
    audit: {
      entity: 'academic_year',
      action: 'update',
      entityId: () => id,
      details: () => ({ previous: previousId, current: id }),
    },
    fallbackError: 'Failed to set the current academic year. Please try again.',
  })
}
