'use client'

import { useState } from 'react'

import FieldError from './FieldError'
import { label, requiredMark } from './styles'

type Props = {
  /** May hold links, e.g. to a policy the box refers to. */
  label: React.ReactNode
  name: string
  defaultChecked?: boolean
  /** Makes the checkbox controlled; pass `onChange` with it. */
  checked?: boolean
  onChange?: (checked: boolean) => void
  description?: string
  error?: string
  required?: boolean
  /**
   * For a required box: shown in the browser's own prompt and beneath the box
   * when the form is submitted with it unticked, until the box is changed.
   */
  requiredMessage?: string
  /** A disabled checkbox is not submitted with the form. */
  disabled?: boolean
}

export default function CheckboxField({
  label: labelText,
  name,
  defaultChecked = false,
  checked,
  onChange,
  description,
  error,
  required = false,
  requiredMessage,
  disabled = false,
}: Props): React.ReactElement {
  const [uncontrolledChecked, setUncontrolledChecked] = useState(defaultChecked)
  const [blocked, setBlocked] = useState(false)
  const isChecked = checked ?? uncontrolledChecked
  const descriptionId = `${name}-hint`
  const errorId = `${name}-error`
  // A required box's only error is that it is unticked, so ticking it clears
  // the error until the next submit.
  const shownError =
    required && isChecked
      ? undefined
      : (error ?? (blocked ? requiredMessage : undefined))
  const describedBy =
    [description && descriptionId, shownError && errorId]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div>
      <div className="flex items-start gap-2">
        <input
          id={name}
          name={name}
          type="checkbox"
          value="on"
          required={required}
          disabled={disabled}
          checked={isChecked}
          onChange={(e) => {
            e.currentTarget.setCustomValidity('')
            setBlocked(false)
            if (checked === undefined)
              setUncontrolledChecked(e.currentTarget.checked)
            onChange?.(e.currentTarget.checked)
          }}
          onInvalid={(e) => {
            if (!requiredMessage) return
            e.currentTarget.setCustomValidity(requiredMessage)
            setBlocked(true)
          }}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={describedBy}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
          <label
            htmlFor={name}
            className={
              disabled
                ? 'block cursor-not-allowed text-sm font-medium text-gray-400'
                : `${label} cursor-pointer`
            }
          >
            {labelText}
            {required && (
              <span aria-hidden="true" className={requiredMark}>
                *
              </span>
            )}
          </label>
          {description && (
            <p id={descriptionId} className="text-xs text-gray-500">
              {description}
            </p>
          )}
        </div>
      </div>
      <FieldError id={errorId} error={shownError} announce={required} />
    </div>
  )
}
