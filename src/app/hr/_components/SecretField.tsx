'use client'

import { useState } from 'react'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

import { FieldError, formStyles } from '@/components/form'

type Props = {
  label: string
  name: string
  defaultValue: string | null
  maxLength?: number
  error?: string
}

/** Masked input with an eye toggle, for bank details on the payroll form. */
export default function SecretField({
  label,
  name,
  defaultValue,
  maxLength,
  error,
}: Props): React.ReactElement {
  const [revealed, setRevealed] = useState(false)
  const action = revealed ? 'Hide' : 'Show'

  return (
    <div>
      <label htmlFor={name} className={formStyles.label}>
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={name}
          name={name}
          type={revealed ? 'text' : 'password'}
          inputMode="numeric"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          maxLength={maxLength}
          defaultValue={defaultValue ?? ''}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${name}-error` : undefined}
          className={`${formStyles.inputBase} pr-10${error ? ` ${formStyles.inputInvalid}` : ''}`}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-label={`${action} ${label.toLowerCase()}`}
          aria-pressed={revealed}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
        >
          {revealed ? (
            <EyeSlashIcon className="h-5 w-5" />
          ) : (
            <EyeIcon className="h-5 w-5" />
          )}
        </button>
      </div>
      <FieldError id={`${name}-error`} error={error} />
    </div>
  )
}
