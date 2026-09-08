'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import {
  approveRegistration,
  rejectRegistration,
  deleteRegistrationSubmission,
  getRegistrationSubmissionById,
  logAuditEvent,
} from '@/db'
import { getUserFriendlyDbError } from '@/lib/db-error'
import { canApproveRegistrations } from '@/lib/permissions'
import {
  approveRegistrationSchema,
  rejectRegistrationSchema,
  extractFormFields,
  type ActionResult,
} from '@/lib/schemas'
import type { StaffRole } from '@/types/next-auth'

export async function approveRegistrationAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canApproveRegistrations(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  const parsed = approveRegistrationSchema.safeParse(
    extractFormFields(formData),
  )
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  let studentId: string
  try {
    studentId = await approveRegistration({
      submissionId: id,
      staffId: staffId!,
      studentCode: parsed.data.student_code,
      classId: parsed.data.class_id,
      existingStudentId: parsed.data.existing_student_id,
      reuseGuardians: parsed.data.reuse_guardians,
    })

    logAuditEvent({
      staffId,
      action: 'registration_approved',
      entity: 'registration_submission',
      entityId: id,
      details: {
        studentId,
        linkedExisting: parsed.data.existing_student_id !== null,
        classId: parsed.data.class_id,
        reuseGuardians: parsed.data.reuse_guardians,
      },
    })
    revalidatePath('/registrations')
    revalidatePath('/dashboard')
    revalidatePath('/students')
  } catch (err) {
    console.error('[approveRegistrationAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to approve registration. Please try again.',
      ),
    }
  }

  redirect(`/students/${studentId}/edit`)
}

export async function rejectRegistrationAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canApproveRegistrations(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  const parsed = rejectRegistrationSchema.safeParse(extractFormFields(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    await rejectRegistration({
      submissionId: id,
      staffId: staffId!,
      reason: parsed.data.reason,
    })

    logAuditEvent({
      staffId,
      action: 'registration_rejected',
      entity: 'registration_submission',
      entityId: id,
      details: { reason: parsed.data.reason },
    })
    revalidatePath('/registrations')
    revalidatePath('/dashboard')
  } catch (err) {
    console.error('[rejectRegistrationAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to reject registration. Please try again.',
      ),
    }
  }

  redirect('/registrations?status=rejected')
}

export async function deleteRegistrationAction(
  id: string,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canApproveRegistrations(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  try {
    const submission = await getRegistrationSubmissionById(id)
    await deleteRegistrationSubmission(id)

    logAuditEvent({
      staffId,
      action: 'registration_deleted',
      entity: 'registration_submission',
      entityId: id,
      details: {
        childName: submission
          ? `${submission.child_first_name} ${submission.child_last_name}`
          : undefined,
      },
    })
    revalidatePath('/registrations')
    revalidatePath('/dashboard')
  } catch (err) {
    console.error('[deleteRegistrationAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to delete registration. Please try again.',
      ),
    }
  }

  redirect('/registrations?status=rejected')
}
