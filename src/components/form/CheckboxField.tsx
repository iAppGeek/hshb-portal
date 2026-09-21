import FieldError from './FieldError'
import { label } from './styles'

type Props = {
  label: string
  name: string
  defaultChecked?: boolean
  /** Makes the checkbox controlled; pass `onChange` with it. */
  checked?: boolean
  onChange?: (checked: boolean) => void
  description?: string
  error?: string
  required?: boolean
}

export default function CheckboxField({
  label: labelText,
  name,
  defaultChecked,
  checked,
  onChange,
  description,
  error,
  required = false,
}: Props): React.ReactElement {
  const descriptionId = `${name}-hint`
  const errorId = `${name}-error`
  const describedBy =
    [description && descriptionId, error && errorId]
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
          {...(checked !== undefined
            ? { checked, onChange: (e) => onChange?.(e.target.checked) }
            : { defaultChecked })}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
          <label htmlFor={name} className={label}>
            {labelText}
          </label>
          {description && (
            <p id={descriptionId} className="text-xs text-gray-500">
              {description}
            </p>
          )}
        </div>
      </div>
      <FieldError id={errorId} error={error} />
    </div>
  )
}
