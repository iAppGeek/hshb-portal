'use server'

import { redirect } from 'next/navigation'

import { createPhotoOptOut, logAuditEvent } from '@/db'
import { getUserFriendlyDbError } from '@/lib/db-error'
import { getClientIp } from '@/lib/request-ip'
import {
  photoOptOutSchema,
  extractFormFields,
  type ActionResult,
} from '@/lib/schemas'
import { verifyTurnstileToken, omitTurnstileToken } from '@/lib/turnstile'

export async function submitPhotoOptOutAction(
  formData: FormData,
): Promise<ActionResult> {
  if (!process.env.TURNSTILE_SECRET_KEY)
    return {
      error: 'This form is temporarily unavailable. Please try again later.',
    }

  const parsed = photoOptOutSchema.safeParse(extractFormFields(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const ip = await getClientIp()
  if (!(await verifyTurnstileToken(parsed.data.turnstile_token, ip)))
    return { error: 'Verification failed. Please try again.' }

  try {
    const { id } = await createPhotoOptOut(omitTurnstileToken(parsed.data))
    logAuditEvent({
      staffId: null,
      action: 'photo_opt_out_submitted',
      entity: 'photo_consent_opt_out',
      entityId: id,
    })
  } catch (err) {
    console.error('[submitPhotoOptOutAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to submit your request. Please try again.',
      ),
    }
  }

  redirect('/register/photo-opt-out/success')
}
