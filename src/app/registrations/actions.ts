'use server'

import {
  approveRegistration,
  rejectRegistration,
  deleteRegistrationSubmission,
  getRegistrationSubmissionById,
  applyPhotoOptOut,
  rejectPhotoOptOut,
  deletePhotoOptOut,
  getPhotoOptOutById,
} from '@/db'
import { runAction, type ActionResult } from '@/lib/action'
import { canApproveRegistrations } from '@/lib/permissions'
import {
  assertStudentCodeFree,
  guardStudentCode,
} from '@/lib/student-code-check'
import {
  applyPhotoOptOutSchema,
  approveRegistrationSchema,
  rejectReasonSchema,
} from '@/lib/schemas'

import { OPT_OUTS_PATH } from './paths'

/** The dialogs pass plain values; runAction parses them from FormData. */
function formDataOf(fields: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) formData.set(key, value)
  return formData
}

// ─── Registrations ───────────────────────────────────────────────────────────

export async function approveRegistrationAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'registrations.approve',
    permission: canApproveRegistrations,
    schema: approveRegistrationSchema,
    formData,
    run: async (input, { actor }) => {
      // Linking an existing student gives it this code, so it may keep its own.
      await assertStudentCodeFree(input.student_code, input.existing_student_id)
      return guardStudentCode(
        input.student_code,
        approveRegistration({
          submissionId: id,
          staffId: actor.staffId,
          studentCode: input.student_code,
          classId: input.class_id,
          existingStudentId: input.existing_student_id,
          reuseGuardians: input.reuse_guardians,
        }),
      )
    },
    audit: {
      entity: 'registration_submission',
      action: 'registration_approved',
      entityId: () => id,
      details: (result, input) => ({
        studentId: result.student_id,
        linkedExisting: result.linked_existing,
        classId: input.class_id,
        reuseGuardians: input.reuse_guardians,
        guardians: result.guardians,
        studentChanges: result.student_changes,
      }),
    },
    redirectTo: (result) => `/students/${result.student_id}/edit`,
    fallbackError: 'Failed to approve registration. Please try again.',
  })
}

export async function rejectRegistrationAction(
  id: string,
  reason: string,
): Promise<ActionResult> {
  return runAction({
    name: 'registrations.reject',
    permission: canApproveRegistrations,
    schema: rejectReasonSchema,
    formData: formDataOf({ reason }),
    run: (input, { actor }) =>
      rejectRegistration({
        submissionId: id,
        staffId: actor.staffId,
        reason: input.reason,
      }),
    audit: {
      entity: 'registration_submission',
      action: 'registration_rejected',
      entityId: () => id,
      details: (_result, input) => ({ reason: input.reason }),
    },
    redirectTo: '/registrations?status=rejected',
    fallbackError: 'Failed to reject registration. Please try again.',
  })
}

export async function deleteRegistrationAction(
  id: string,
): Promise<ActionResult> {
  return runAction({
    name: 'registrations.delete',
    permission: canApproveRegistrations,
    formData: new FormData(),
    run: async () => {
      const submission = await getRegistrationSubmissionById(id)
      await deleteRegistrationSubmission(id)
      return submission
    },
    audit: {
      entity: 'registration_submission',
      action: 'registration_deleted',
      entityId: () => id,
      details: (submission) => ({
        childName: submission
          ? `${submission.child_first_name} ${submission.child_last_name}`
          : undefined,
        status: submission?.status,
      }),
    },
    redirectTo: '/registrations?status=rejected',
    fallbackError: 'Failed to delete registration. Please try again.',
  })
}

// ─── Photo consent opt-outs ──────────────────────────────────────────────────

export async function applyPhotoOptOutAction(
  id: string,
  studentId: string,
): Promise<ActionResult> {
  return runAction({
    name: 'registrations.photo-opt-out.apply',
    permission: canApproveRegistrations,
    schema: applyPhotoOptOutSchema,
    formData: formDataOf({ student_id: studentId }),
    run: (input, { actor }) =>
      applyPhotoOptOut({
        requestId: id,
        staffId: actor.staffId,
        studentId: input.student_id,
      }),
    audit: {
      entity: 'photo_consent_opt_out',
      action: 'photo_opt_out_applied',
      entityId: () => id,
      details: (_result, input) => ({ studentId: input.student_id }),
    },
    redirectTo: OPT_OUTS_PATH,
    fallbackError: 'Failed to apply the opt-out. Please try again.',
  })
}

export async function rejectPhotoOptOutAction(
  id: string,
  reason: string,
): Promise<ActionResult> {
  return runAction({
    name: 'registrations.photo-opt-out.reject',
    permission: canApproveRegistrations,
    schema: rejectReasonSchema,
    formData: formDataOf({ reason }),
    run: (input, { actor }) =>
      rejectPhotoOptOut({
        requestId: id,
        staffId: actor.staffId,
        reason: input.reason,
      }),
    audit: {
      entity: 'photo_consent_opt_out',
      action: 'photo_opt_out_rejected',
      entityId: () => id,
      details: (_result, input) => ({ reason: input.reason }),
    },
    redirectTo: OPT_OUTS_PATH,
    fallbackError: 'Failed to reject the request. Please try again.',
  })
}

export async function deletePhotoOptOutAction(
  id: string,
): Promise<ActionResult> {
  return runAction({
    name: 'registrations.photo-opt-out.delete',
    permission: canApproveRegistrations,
    formData: new FormData(),
    run: async () => {
      const request = await getPhotoOptOutById(id)
      await deletePhotoOptOut(id)
      return request
    },
    audit: {
      entity: 'photo_consent_opt_out',
      action: 'photo_opt_out_deleted',
      entityId: () => id,
      details: (request) => ({
        childName: request
          ? `${request.child_first_name} ${request.child_last_name}`
          : undefined,
        status: request?.status,
      }),
    },
    redirectTo: OPT_OUTS_PATH,
    fallbackError: 'Failed to delete the request. Please try again.',
  })
}
