'use client'

import type { ActionResult } from '@/lib/action'
import { FormActions, TextField, useServerForm } from '@/components/form'

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
        <TextField
          label="Code"
          name="code"
          required
          readOnly={mode === 'edit'}
          defaultValue={defaultValues.code}
          placeholder="e.g. 2026-27"
          error={fieldError('code')}
        />
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
