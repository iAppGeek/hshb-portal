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
  options: { value: string; label: string }[]
  defaultValue?: string | null
  placeholder?: string
}

export default function SelectField({
  label: labelText,
  name,
  required = false,
  error,
  hint,
  className,
  disabled,
  options,
  defaultValue,
  placeholder,
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
      <select
        id={name}
        name={name}
        required={required}
        disabled={disabled}
        defaultValue={defaultValue ?? ''}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${input}${error ? ` ${inputInvalid}` : ''}`}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && !error && (
        <p id={hintId} className={hintClass}>
          {hint}
        </p>
      )}
      <FieldError id={errorId} error={error} />
    </div>
  )
}
