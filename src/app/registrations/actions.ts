'use server'

import {
  approveRegistration,
  rejectRegistration,
  deleteRegistrationSubmission,
  getRegistrationSubmissionById,
} from '@/db'
import { runAction, type ActionResult } from '@/lib/action'
import { canApproveRegistrations } from '@/lib/permissions'
import {
  approveRegistrationSchema,
  rejectRegistrationSchema,
} from '@/lib/schemas'

export async function approveRegistrationAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'registrations.approve',
    permission: canApproveRegistrations,
    schema: approveRegistrationSchema,
    formData,
    run: (input, { actor }) =>
      approveRegistration({
        submissionId: id,
        staffId: actor.staffId,
        studentCode: input.student_code,
        classId: input.class_id,
        existingStudentId: input.existing_student_id,
        reuseGuardians: input.reuse_guardians,
      }),
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
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'registrations.reject',
    permission: canApproveRegistrations,
    schema: rejectRegistrationSchema,
    formData,
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
