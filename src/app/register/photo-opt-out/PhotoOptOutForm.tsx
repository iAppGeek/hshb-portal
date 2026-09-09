'use client'

import { useState, useTransition } from 'react'

import TurnstileWidget from '@/clientComponents/TurnstileWidget'
import { SHORT_TEXT_MAX, LONG_TEXT_MAX } from '@/lib/schemas'

import { submitPhotoOptOutAction } from './actions'

type Props = {
  turnstileSiteKey: string
}

export default function PhotoOptOutForm({ turnstileSiteKey }: Props) {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await submitPhotoOptOutAction(new FormData(form))
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">
          Child&apos;s details
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="First name"
            name="child_first_name"
            required
            maxLength={SHORT_TEXT_MAX}
          />
          <Field
            label="Last name"
            name="child_last_name"
            required
            maxLength={SHORT_TEXT_MAX}
          />
          <Field
            label="Date of birth"
            name="date_of_birth"
            type="date"
            required
          />
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">
          Declaration
        </h2>
        <div className="space-y-4">
          <Field
            label="Your full name"
            name="declaration_name"
            required
            hint="Typing your name here acts as your signature"
            maxLength={SHORT_TEXT_MAX}
          />
          <TextArea
            label="Anything else we should know? (optional)"
            name="notes"
            maxLength={LONG_TEXT_MAX}
          />
        </div>

        {turnstileSiteKey && (
          <div className="mt-4">
            <TurnstileWidget siteKey={turnstileSiteKey} onToken={setToken} />
            <input type="hidden" name="turnstile_token" value={token ?? ''} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending || !token}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? 'Submitting…' : 'Withdraw photo consent'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  )
}

function Field({
  label,
  name,
  type = 'text',
  required = false,
  hint,
  maxLength,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  hint?: string
  maxLength?: number
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function TextArea({
  label,
  name,
  maxLength,
}: {
  label: string
  name: string
  maxLength?: number
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={3}
        maxLength={maxLength}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
      />
    </div>
  )
}
