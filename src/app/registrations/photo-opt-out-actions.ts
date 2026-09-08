'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import {
  applyPhotoOptOut,
  rejectPhotoOptOut,
  deletePhotoOptOut,
  getPhotoOptOutById,
  logAuditEvent,
} from '@/db'
import { getUserFriendlyDbError } from '@/lib/db-error'
import { canApproveRegistrations } from '@/lib/permissions'
import {
  applyPhotoOptOutSchema,
  rejectPhotoOptOutSchema,
  extractFormFields,
  type ActionResult,
} from '@/lib/schemas'
import type { StaffRole } from '@/types/next-auth'

export async function applyPhotoOptOutAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canApproveRegistrations(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  const parsed = applyPhotoOptOutSchema.safeParse(extractFormFields(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    await applyPhotoOptOut({
      requestId: id,
      staffId: staffId!,
      studentId: parsed.data.student_id,
    })

    logAuditEvent({
      staffId,
      action: 'photo_opt_out_applied',
      entity: 'photo_consent_opt_out',
      entityId: id,
      details: { studentId: parsed.data.student_id },
    })
    revalidatePath('/registrations')
    revalidatePath('/dashboard')
  } catch (err) {
    console.error('[applyPhotoOptOutAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to apply the opt-out. Please try again.',
      ),
    }
  }

  redirect('/registrations')
}

export async function rejectPhotoOptOutAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canApproveRegistrations(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  const parsed = rejectPhotoOptOutSchema.safeParse(extractFormFields(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    await rejectPhotoOptOut({
      requestId: id,
      staffId: staffId!,
      reason: parsed.data.reason,
    })

    logAuditEvent({
      staffId,
      action: 'photo_opt_out_rejected',
      entity: 'photo_consent_opt_out',
      entityId: id,
      details: { reason: parsed.data.reason },
    })
    revalidatePath('/registrations')
    revalidatePath('/dashboard')
  } catch (err) {
    console.error('[rejectPhotoOptOutAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to reject the request. Please try again.',
      ),
    }
  }

  redirect('/registrations')
}

export async function deletePhotoOptOutAction(
  id: string,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canApproveRegistrations(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  try {
    const request = await getPhotoOptOutById(id)
    await deletePhotoOptOut(id)

    logAuditEvent({
      staffId,
      action: 'photo_opt_out_deleted',
      entity: 'photo_consent_opt_out',
      entityId: id,
      details: {
        childName: request
          ? `${request.child_first_name} ${request.child_last_name}`
          : undefined,
      },
    })
    revalidatePath('/registrations')
    revalidatePath('/dashboard')
  } catch (err) {
    console.error('[deletePhotoOptOutAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to delete the request. Please try again.',
      ),
    }
  }

  redirect('/registrations')
}
