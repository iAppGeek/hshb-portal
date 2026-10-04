'use server'

import type { z } from 'zod'

import { createRegistrationSubmission } from '@/db'
import {
  ActionError,
  firstFieldErrors,
  prefixFieldErrors,
  runAction,
  type ActionResult,
} from '@/lib/action'
import {
  asksMayLeaveUnaccompanied,
  PRIVACY_NOTICE_VERSION,
} from '@/lib/consents'
import { getClientIp } from '@/lib/request-ip'
import {
  registrationSubmissionSchema,
  registrationContactSchema,
  registrationParentContactSchema,
  extractFormFields,
  extractRegistrationContact,
} from '@/lib/schemas'
import { verifyTurnstileToken, omitTurnstileToken } from '@/lib/turnstile'
import type { Database } from '@/types/database'

type ParsedSubmission = z.infer<typeof registrationSubmissionSchema>
type SubmissionInsert =
  Database['public']['Tables']['registration_submissions']['Insert']

type Contact = z.infer<typeof registrationContactSchema> & {
  contact_role: 'primary' | 'secondary' | 'additional_1' | 'additional_2'
}

/**
 * The row to store. The consent timestamp and Privacy Notice version are set
 * here, never taken from the form, and the leave-alone answer only counts for
 * the year groups that are asked it.
 */
function toInsert(data: ParsedSubmission, now: Date): SubmissionInsert {
  const {
    has_secondary: _hasSecondary,
    has_contact1: _hasContact1,
    has_contact2: _hasContact2,
    ...rest
  } = omitTurnstileToken(data)
  return {
    ...rest,
    may_leave_unaccompanied:
      asksMayLeaveUnaccompanied(data.preferred_year_group) &&
      data.may_leave_unaccompanied,
    consents_recorded_at: now.toISOString(),
    privacy_notice_version: PRIVACY_NOTICE_VERSION,
  }
}

/**
 * Contacts arrive as four prefixed blocks of the same form, so they are parsed
 * here rather than through `runAction`'s single `schema`.
 */
function extractContacts(
  formData: FormData,
  data: ParsedSubmission,
): Contact[] {
  const contacts: Contact[] = []
  // Occupation is required of parents/carers but not of emergency contacts.
  for (const [prefix, role, present, isParent] of [
    ['primary', 'primary', true, true],
    ['secondary', 'secondary', data.has_secondary, true],
    ['contact1', 'additional_1', data.has_contact1, false],
    ['contact2', 'additional_2', data.has_contact2, false],
  ] as const) {
    if (!present) continue
    const schema = isParent
      ? registrationParentContactSchema
      : registrationContactSchema
    const c = schema.safeParse(extractRegistrationContact(formData, prefix))
    if (!c.success)
      throw new ActionError(
        c.error.issues[0].message,
        prefixFieldErrors(firstFieldErrors(c.error), prefix),
      )
    contacts.push({ contact_role: role, ...c.data })
  }
  return contacts
}

export async function submitRegistrationAction(
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'register.submit',
    public: true,
    formData,
    run: async (_input, { formData }) => {
      const parsed = registrationSubmissionSchema.safeParse(
        extractFormFields(formData),
      )
      if (!parsed.success)
        throw new ActionError(
          parsed.error.issues[0].message,
          firstFieldErrors(parsed.error),
        )

      const contacts = extractContacts(formData, parsed.data)

      const ip = await getClientIp()
      if (!(await verifyTurnstileToken(parsed.data.turnstile_token, ip)))
        throw new ActionError('Verification failed. Please try again.')

      return createRegistrationSubmission({
        submission: toInsert(parsed.data, new Date()),
        contacts,
      })
    },
    audit: {
      entity: 'registration_submission',
      action: 'registration_submitted',
      entityId: (result) => result.id,
    },
    redirectTo: '/register/success',
    fallbackError: 'Failed to submit registration. Please try again.',
  })
}
