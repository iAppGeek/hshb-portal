'use server'

import { redirect } from 'next/navigation'
import type { z } from 'zod'

import { createRegistrationSubmission, logAuditEvent } from '@/db'
import { getUserFriendlyDbError } from '@/lib/db-error'
import { getClientIp } from '@/lib/request-ip'
import {
  registrationSubmissionSchema,
  registrationContactSchema,
  extractFormFields,
  extractRegistrationContact,
  type ActionResult,
} from '@/lib/schemas'
import { verifyTurnstileToken, omitTurnstileToken } from '@/lib/turnstile'

type ParsedSubmission = z.infer<typeof registrationSubmissionSchema>

function toInsert(data: ParsedSubmission) {
  const {
    has_secondary: _hasSecondary,
    has_contact1: _hasContact1,
    has_contact2: _hasContact2,
    ...rest
  } = omitTurnstileToken(data)
  return rest
}

export async function submitRegistrationAction(
  formData: FormData,
): Promise<ActionResult> {
  if (!process.env.TURNSTILE_SECRET_KEY)
    return {
      error: 'Registration is temporarily unavailable. Please try again later.',
    }

  const parsed = registrationSubmissionSchema.safeParse(
    extractFormFields(formData),
  )
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const contacts: (z.infer<typeof registrationContactSchema> & {
    contact_role: 'primary' | 'secondary' | 'additional_1' | 'additional_2'
  })[] = []
  for (const [prefix, role, present] of [
    ['primary', 'primary', true],
    ['secondary', 'secondary', parsed.data.has_secondary],
    ['contact1', 'additional_1', parsed.data.has_contact1],
    ['contact2', 'additional_2', parsed.data.has_contact2],
  ] as const) {
    if (!present) continue
    const c = registrationContactSchema.safeParse(
      extractRegistrationContact(formData, prefix),
    )
    if (!c.success) return { error: c.error.issues[0].message }
    contacts.push({ contact_role: role, ...c.data })
  }

  const ip = await getClientIp()
  if (!(await verifyTurnstileToken(parsed.data.turnstile_token, ip)))
    return { error: 'Verification failed. Please try again.' }

  try {
    const { id } = await createRegistrationSubmission({
      submission: toInsert(parsed.data),
      contacts,
    })
    logAuditEvent({
      staffId: null,
      action: 'registration_submitted',
      entity: 'registration_submission',
      entityId: id,
    })
  } catch (err) {
    console.error('[submitRegistrationAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to submit registration. Please try again.',
      ),
    }
  }

  redirect('/register/success')
}
