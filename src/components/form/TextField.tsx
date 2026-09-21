import FieldError from './FieldError'
import {
  hint as hintClass,
  input,
  inputInvalid,
  inputReadOnly,
  label,
  requiredMark,
} from './styles'

export type FieldBase = {
  label: string
  name: string
  required?: boolean
  error?: string
  hint?: string
  className?: string
  disabled?: boolean
}

type TextFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'date'
  | 'time'
  | 'datetime-local'
  | 'number'
  | 'password'
  | 'search'
  | 'url'

const AUTO_COMPLETE_BY_TYPE: Partial<Record<TextFieldType, string>> = {
  email: 'email',
  tel: 'tel',
}

const INPUT_MODE_BY_TYPE: Partial<
  Record<TextFieldType, React.HTMLAttributes<HTMLInputElement>['inputMode']>
> = {
  email: 'email',
  tel: 'tel',
  number: 'decimal',
}

type Props = FieldBase & {
  type?: TextFieldType
  defaultValue?: string | null
  /** Makes the input controlled; pass `onChange` with it. */
  value?: string
  onChange?: (value: string) => void
  /** Unlike `disabled`, a read-only input is still submitted with the form. */
  readOnly?: boolean
  placeholder?: string
  autoComplete?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  maxLength?: number
  min?: string | number
  max?: string | number
  step?: string | number
}

export default function TextField({
  label: labelText,
  name,
  type = 'text',
  required = false,
  error,
  hint,
  className,
  disabled,
  defaultValue,
  value,
  onChange,
  readOnly,
  placeholder,
  autoComplete,
  inputMode,
  maxLength,
  min,
  max,
  step,
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
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        {...(value !== undefined
          ? { value, onChange: (e) => onChange?.(e.target.value) }
          : { defaultValue: defaultValue ?? undefined })}
        placeholder={placeholder}
        autoComplete={autoComplete ?? AUTO_COMPLETE_BY_TYPE[type]}
        inputMode={inputMode ?? INPUT_MODE_BY_TYPE[type]}
        maxLength={maxLength}
        min={min}
        max={max}
        step={step}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[input, readOnly && inputReadOnly, error && inputInvalid]
          .filter(Boolean)
          .join(' ')}
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
