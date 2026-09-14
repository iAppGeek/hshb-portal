'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import {
  createAcademicYear,
  updateAcademicYear,
  setCurrentAcademicYear,
  logAuditEvent,
} from '@/db'
import { getUserFriendlyDbError } from '@/lib/db-error'
import { canAccessAdminTasks } from '@/lib/permissions'
import {
  academicYearSchema,
  academicYearDatesSchema,
  extractFormFields,
  type ActionResult,
} from '@/lib/schemas'
import type { StaffRole } from '@/types/next-auth'

export async function createAcademicYearAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canAccessAdminTasks(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  const raw = extractFormFields(formData)
  const parsed = academicYearSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    const year = await createAcademicYear(parsed.data)
    logAuditEvent({
      staffId,
      action: 'create',
      entity: 'academic_year',
      entityId: year.id,
      details: parsed.data,
    })
    revalidatePath('/admin')
  } catch (err) {
    console.error('[createAcademicYearAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to create academic year. Please try again.',
      ),
    }
  }

  redirect('/admin?tab=academic-years')
}

export async function updateAcademicYearAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canAccessAdminTasks(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  const raw = extractFormFields(formData)
  const parsed = academicYearDatesSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    await updateAcademicYear(id, parsed.data)
    logAuditEvent({
      staffId,
      action: 'update',
      entity: 'academic_year',
      entityId: id,
      details: parsed.data,
    })
    revalidatePath('/admin')
  } catch (err) {
    console.error('[updateAcademicYearAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to update academic year. Please try again.',
      ),
    }
  }

  redirect('/admin?tab=academic-years')
}

export async function setCurrentAcademicYearAction(
  id: string,
  previousId: string | null,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canAccessAdminTasks(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  try {
    await setCurrentAcademicYear(id)
    logAuditEvent({
      staffId,
      action: 'update',
      entity: 'academic_year',
      entityId: id,
      details: { previous: previousId, current: id },
    })
    revalidatePath('/admin')
    revalidatePath('/classes')
    revalidatePath('/attendance')
    revalidatePath('/finance')
  } catch (err) {
    console.error('[setCurrentAcademicYearAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to set the current academic year. Please try again.',
      ),
    }
  }
}
