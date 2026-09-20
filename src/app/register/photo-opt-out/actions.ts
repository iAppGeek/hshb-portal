'use server'

import { createPhotoOptOut } from '@/db'
import { ActionError, runAction, type ActionResult } from '@/lib/action'
import { getClientIp } from '@/lib/request-ip'
import { photoOptOutSchema } from '@/lib/schemas'
import { verifyTurnstileToken, omitTurnstileToken } from '@/lib/turnstile'

export async function submitPhotoOptOutAction(
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'register.photo-opt-out.submit',
    public: true,
    schema: photoOptOutSchema,
    formData,
    run: async (input) => {
      if (!process.env.TURNSTILE_SECRET_KEY)
        throw new ActionError(
          'This form is temporarily unavailable. Please try again later.',
        )

      const ip = await getClientIp()
      if (!(await verifyTurnstileToken(input.turnstile_token, ip)))
        throw new ActionError('Verification failed. Please try again.')

      return createPhotoOptOut(omitTurnstileToken(input))
    },
    audit: {
      entity: 'photo_consent_opt_out',
      action: 'photo_opt_out_submitted',
      entityId: (result) => result.id,
      details: () => ({}),
    },
    redirectTo: '/register/photo-opt-out/success',
    fallbackError: 'Failed to submit your request. Please try again.',
  })
}
