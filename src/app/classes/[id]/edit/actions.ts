'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import {
  updateClass,
  setClassStudents,
  getClassById,
  getAcademicYears,
  getCurrentAcademicYear,
  logAuditEvent,
} from '@/db'
import { isClassCompleted } from '@/lib/classes'
import { getUserFriendlyDbError } from '@/lib/db-error'
import { canEditClasses } from '@/lib/permissions'
import {
  updateClassSchema,
  extractFormFields,
  type ActionResult,
} from '@/lib/schemas'
import type { StaffRole } from '@/types/next-auth'

export async function updateClassAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canEditClasses(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  const [cls, years, currentYear] = await Promise.all([
    getClassById(id),
    getAcademicYears(),
    getCurrentAcademicYear(),
  ])
  if (!cls) return { error: 'Class not found' }
  if (isClassCompleted(cls, years, currentYear)) {
    return { error: "Completed classes can't be edited." }
  }

  const raw = extractFormFields(formData, ['student_ids'])
  const parsed = updateClassSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { student_ids, ...classData } = parsed.data

  try {
    await updateClass(id, {
      name: classData.name,
      year_group: classData.year_group,
      room_number: classData.room_number,
      teacher_id: classData.teacher_id,
    })

    await setClassStudents(id, student_ids)
    logAuditEvent({
      staffId,
      action: 'update',
      entity: 'class',
      entityId: id,
      details: parsed.data as Record<string, unknown>,
    })
    revalidatePath('/classes')
  } catch (err) {
    console.error('[updateClassAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to update class. Please try again.',
      ),
    }
  }

  redirect('/classes')
}
