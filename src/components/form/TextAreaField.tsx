import FieldError from './FieldError'
import type { FieldBase } from './TextField'
import {
  hint as hintClass,
  input,
  inputInvalid,
  label,
  requiredMark,
} from './styles'

type Props = FieldBase & {
  defaultValue?: string | null
  rows?: number
  maxLength?: number
}

export default function TextAreaField({
  label: labelText,
  name,
  required = false,
  error,
  hint,
  className,
  disabled,
  defaultValue,
  rows = 3,
  maxLength,
}: Props): React.ReactElement {
  const hintId = `${name}-hint`
  const errorId = `${name}-error`
  const describedBy =
    [hint && !error && hintId, error && errorId].filter(Boolean).join(' ') ||
    undefined

  return (
    <div className={className}>
      <label htmlFor={name} className={label}>
        {labelText}
        {required && <span className={requiredMark}>*</span>}
      </label>
      <textarea
        id={name}
        name={name}
        required={required}
        disabled={disabled}
        defaultValue={defaultValue ?? undefined}
        rows={rows}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${input}${error ? ` ${inputInvalid}` : ''}`}
      />
      {hint && !error && (
        <p id={hintId} className={hintClass}>
          {hint}
        </p>
      )}
      <FieldError id={errorId} error={error} />
    </div>
  )
}
