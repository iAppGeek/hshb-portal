'use server'

import {
  addStudentPayment,
  deleteStudentPayment,
  upsertStudentFeeAccount,
} from '@/db'
import { ActionError, runAction, type ActionResult } from '@/lib/action'
import { canManageFinance } from '@/lib/permissions'
import { studentFeeAccountSchema, studentPaymentSchema } from '@/lib/schemas'

// These actions return instead of redirecting so the student page stays open.

export async function saveStudentFeeAccountAction(
  studentId: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'finance.student-fees.save',
    permission: canManageFinance,
    schema: studentFeeAccountSchema,
    formData,
    run: ({ academic_year_id, ...input }) =>
      upsertStudentFeeAccount(studentId, academic_year_id, input),
    audit: {
      entity: 'student_fee_account',
      action: 'update',
      entityId: () => studentId,
    },
    fallbackError: 'Failed to save the fee account. Please try again.',
  })
}

export async function addStudentPaymentAction(
  studentId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction({
    name: 'finance.student-fees.add-payment',
    permission: canManageFinance,
    schema: studentPaymentSchema,
    formData,
    run: (input, { actor }) =>
      addStudentPayment(studentId, { ...input, recorded_by: actor.staffId }),
    audit: {
      entity: 'student_payment',
      action: 'create',
      entityId: (payment) => payment.id,
      details: (_payment, input) => ({ student_id: studentId, ...input }),
    },
    fallbackError: 'Failed to record the payment. Please try again.',
  })
}

export async function deleteStudentPaymentAction(
  studentId: string,
  paymentId: string,
): Promise<ActionResult> {
  return runAction({
    name: 'finance.student-fees.delete-payment',
    permission: canManageFinance,
    formData: new FormData(),
    run: async () => {
      const deleted = await deleteStudentPayment(studentId, paymentId)
      if (!deleted) throw new ActionError('That payment no longer exists.')
    },
    audit: {
      entity: 'student_payment',
      action: 'delete',
      entityId: () => paymentId,
      details: () => ({ student_id: studentId }),
    },
    fallbackError: 'Failed to delete the payment. Please try again.',
  })
}
