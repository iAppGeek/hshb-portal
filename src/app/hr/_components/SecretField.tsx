'use client'

import { useState } from 'react'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

type Props = {
  label: string
  name: string
  defaultValue: string | null
  maxLength?: number
}

/** Masked input with an eye toggle, for bank details on the payroll form. */
export default function SecretField({
  label,
  name,
  defaultValue,
  maxLength,
}: Props): React.ReactElement {
  const [revealed, setRevealed] = useState(false)
  const action = revealed ? 'Hide' : 'Show'

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
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
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
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
    </div>
  )
}
