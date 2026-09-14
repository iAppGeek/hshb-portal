'use server'

import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import {
  addStudentPayment,
  deleteStudentPayment,
  logAuditEvent,
  upsertStudentFeeAccount,
} from '@/db'
import { getUserFriendlyDbError } from '@/lib/db-error'
import { canManageFinance } from '@/lib/permissions'
import {
  extractFormFields,
  studentFeeAccountSchema,
  studentPaymentSchema,
  type ActionResult,
} from '@/lib/schemas'
import type { StaffRole } from '@/types/next-auth'

// These actions return instead of redirecting so the student page stays open
// and refreshes in place.

async function authorise(): Promise<
  { actorId: string | null } | { error: string }
> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  if (!canManageFinance(session.user.role as StaffRole)) {
    return { error: 'Not authorised' }
  }
  return { actorId: session.user.staffId ?? null }
}

function revalidateStudent(studentId: string): void {
  revalidatePath('/finance')
  revalidatePath(`/finance/students/${studentId}`)
}

export async function saveStudentFeeAccountAction(
  studentId: string,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await authorise()
  if ('error' in gate) return gate

  const parsed = studentFeeAccountSchema.safeParse(extractFormFields(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { academic_year_id, ...input } = parsed.data

  try {
    await upsertStudentFeeAccount(studentId, academic_year_id, input)
    logAuditEvent({
      staffId: gate.actorId,
      action: 'update',
      entity: 'student_fee_account',
      entityId: studentId,
      details: parsed.data,
    })
    revalidateStudent(studentId)
  } catch (err) {
    console.error('[saveStudentFeeAccountAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to save the fee account. Please try again.',
      ),
    }
  }
}

export async function addStudentPaymentAction(
  studentId: string,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await authorise()
  if ('error' in gate) return gate

  const parsed = studentPaymentSchema.safeParse(extractFormFields(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    const payment = await addStudentPayment(studentId, {
      ...parsed.data,
      recorded_by: gate.actorId,
    })
    logAuditEvent({
      staffId: gate.actorId,
      action: 'create',
      entity: 'student_payment',
      entityId: payment.id,
      details: { student_id: studentId, ...parsed.data },
    })
    revalidateStudent(studentId)
  } catch (err) {
    console.error('[addStudentPaymentAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to record the payment. Please try again.',
      ),
    }
  }
}

export async function deleteStudentPaymentAction(
  studentId: string,
  paymentId: string,
): Promise<ActionResult> {
  const gate = await authorise()
  if ('error' in gate) return gate

  try {
    const deleted = await deleteStudentPayment(studentId, paymentId)
    if (!deleted) return { error: 'That payment no longer exists.' }
    logAuditEvent({
      staffId: gate.actorId,
      action: 'delete',
      entity: 'student_payment',
      entityId: paymentId,
      details: { student_id: studentId },
    })
    revalidateStudent(studentId)
  } catch (err) {
    console.error('[deleteStudentPaymentAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to delete the payment. Please try again.',
      ),
    }
  }
}
