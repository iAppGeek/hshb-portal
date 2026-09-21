'use server'

import {
  applyPhotoOptOut,
  rejectPhotoOptOut,
  deletePhotoOptOut,
  getPhotoOptOutById,
} from '@/db'
import { runAction, type ActionResult } from '@/lib/action'
import { canApproveRegistrations } from '@/lib/permissions'
import { applyPhotoOptOutSchema, rejectPhotoOptOutSchema } from '@/lib/schemas'

export async function applyPhotoOptOutAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'registrations.photo-opt-out.apply',
    permission: canApproveRegistrations,
    schema: applyPhotoOptOutSchema,
    formData,
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
    redirectTo: '/registrations',
    fallbackError: 'Failed to apply the opt-out. Please try again.',
  })
}

export async function rejectPhotoOptOutAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'registrations.photo-opt-out.reject',
    permission: canApproveRegistrations,
    schema: rejectPhotoOptOutSchema,
    formData,
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
    redirectTo: '/registrations',
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
    redirectTo: '/registrations',
    fallbackError: 'Failed to delete the request. Please try again.',
  })
}
