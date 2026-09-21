'use client'

import { useState } from 'react'

import TurnstileWidget from '@/clientComponents/TurnstileWidget'
import { SHORT_TEXT_MAX, LONG_TEXT_MAX } from '@/lib/schemas'
import {
  FormActions,
  FormGrid,
  FormSection,
  TextAreaField,
  TextField,
  useServerForm,
} from '@/components/form'

import { submitPhotoOptOutAction } from './actions'

type Props = {
  turnstileSiteKey: string
}

export default function PhotoOptOutForm({ turnstileSiteKey }: Props) {
  const [token, setToken] = useState<string | null>(null)
  const { handleSubmit, isPending, error, fieldError } = useServerForm(
    submitPhotoOptOutAction,
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Child's details">
        <FormGrid>
          <TextField
            label="First name"
            name="child_first_name"
            required
            maxLength={SHORT_TEXT_MAX}
            error={fieldError('child_first_name')}
          />
          <TextField
            label="Last name"
            name="child_last_name"
            required
            maxLength={SHORT_TEXT_MAX}
            error={fieldError('child_last_name')}
          />
          <TextField
            label="Date of birth"
            name="date_of_birth"
            type="date"
            required
            error={fieldError('date_of_birth')}
          />
        </FormGrid>
      </FormSection>

      <FormSection title="Declaration">
        <div className="space-y-4">
          <TextField
            label="Your full name"
            name="declaration_name"
            required
            hint="Typing your name here acts as your signature"
            maxLength={SHORT_TEXT_MAX}
            error={fieldError('declaration_name')}
          />
          <TextAreaField
            label="Anything else we should know? (optional)"
            name="notes"
            maxLength={LONG_TEXT_MAX}
            error={fieldError('notes')}
          />
        </div>

        {turnstileSiteKey && (
          <div className="mt-4">
            <TurnstileWidget siteKey={turnstileSiteKey} onToken={setToken} />
            <input type="hidden" name="turnstile_token" value={token ?? ''} />
          </div>
        )}
      </FormSection>

      <FormActions
        submitLabel="Withdraw photo consent"
        pendingLabel="Submitting…"
        isPending={isPending}
        disabled={!token}
        error={error ?? undefined}
      />
    </form>
  )
}
