'use client'

import type { ActionResult } from '@/lib/action'
import {
  FieldError,
  FormActions,
  TextField,
  formStyles,
  useServerForm,
} from '@/components/form'

type Props = {
  mode: 'create' | 'edit'
  defaultValues: { code: string; start_date: string; end_date: string }
  action: (formData: FormData) => Promise<ActionResult>
  submitLabel: string
  onDone?: () => void
}

export default function AcademicYearForm({
  mode,
  defaultValues,
  action,
  submitLabel,
  onDone,
}: Props): React.ReactElement {
  const { handleSubmit, isPending, error, fieldError } = useServerForm(action)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Three columns: not a layout FormGrid supports (cols is 1 | 2 only). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          {/* readOnly, not TextField's `disabled`: a disabled input is left
              out of FormData, but `code` must still submit on edit. */}
          <label htmlFor="code" className={formStyles.label}>
            Code<span className={formStyles.requiredMark}>*</span>
          </label>
          <input
            id="code"
            name="code"
            type="text"
            required
            readOnly={mode === 'edit'}
            defaultValue={defaultValues.code}
            placeholder="e.g. 2026-27"
            aria-invalid={fieldError('code') ? true : undefined}
            aria-describedby={fieldError('code') ? 'code-error' : undefined}
            className={`mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm read-only:bg-gray-50 read-only:text-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none${fieldError('code') ? ` ${formStyles.inputInvalid}` : ''}`}
          />
          <FieldError id="code-error" error={fieldError('code')} />
        </div>
        <TextField
          label="Start date"
          name="start_date"
          type="date"
          required
          defaultValue={defaultValues.start_date}
          error={fieldError('start_date')}
        />
        <TextField
          label="End date"
          name="end_date"
          type="date"
          required
          defaultValue={defaultValues.end_date}
          error={fieldError('end_date')}
        />
      </div>

      <FormActions
        submitLabel={submitLabel}
        isPending={isPending}
        error={error ?? undefined}
      >
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        )}
      </FormActions>
    </form>
  )
}
