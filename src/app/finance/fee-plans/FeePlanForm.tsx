'use client'

import { useState } from 'react'

import type { FeePlanWithClasses } from '@/db'
import type { ActionResult } from '@/lib/action'
import {
  CheckboxField,
  FieldError,
  FormActions,
  FormGrid,
  FormSection,
  TextAreaField,
  TextField,
  formStyles,
  useServerForm,
} from '@/components/form'

import type { FeePlanClassOption } from '../_lib/feePlanClasses'

export type FeePlanFormYear = { id: string; code: string }

type Props = {
  plan: FeePlanWithClasses | null
  classes: FeePlanClassOption[]
  years: FeePlanFormYear[]
  defaultAcademicYearId?: string
  /** Class id → label of another plan that already owns the class. */
  takenBy: Record<string, string>
  action: (formData: FormData) => Promise<ActionResult>
  submitLabel: string
}

export default function FeePlanForm({
  plan,
  classes,
  years,
  defaultAcademicYearId,
  takenBy,
  action,
  submitLabel,
}: Props): React.ReactElement {
  const [academicYearId, setAcademicYearId] = useState(
    plan?.academic_year.id ?? defaultAcademicYearId ?? '',
  )
  const { handleSubmit, isPending, error, fieldError } = useServerForm(action)

  const yearClasses = classes.filter(
    (c) => c.academic_year_id === academicYearId,
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Plan details">
        <FormGrid>
          <TextField
            label="Name"
            name="name"
            required
            defaultValue={plan?.name ?? ''}
            error={fieldError('name')}
          />
          <div>
            <label htmlFor="academic_year_id" className={formStyles.label}>
              Academic year<span className={formStyles.requiredMark}>*</span>
            </label>
            <select
              id="academic_year_id"
              name="academic_year_id"
              required
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              aria-invalid={fieldError('academic_year_id') ? true : undefined}
              aria-describedby={
                fieldError('academic_year_id')
                  ? 'academic_year_id-error'
                  : undefined
              }
              className={`${formStyles.input}${fieldError('academic_year_id') ? ` ${formStyles.inputInvalid}` : ''}`}
            >
              <option value="" disabled>
                Select a year…
              </option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.code}
                </option>
              ))}
            </select>
            <FieldError
              id="academic_year_id-error"
              error={fieldError('academic_year_id')}
            />
          </div>
          <TextField
            label="Full year amount (£)"
            name="full_year_amount"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={plan?.full_year_amount?.toFixed(2) ?? ''}
            error={fieldError('full_year_amount')}
          />
          <TextField
            label="Monthly instalment (£)"
            name="monthly_instalment_amount"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={plan?.monthly_instalment_amount?.toFixed(2) ?? ''}
            error={fieldError('monthly_instalment_amount')}
          />
          <TextField
            label="Termly instalment (£)"
            name="termly_instalment_amount"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={plan?.termly_instalment_amount?.toFixed(2) ?? ''}
            error={fieldError('termly_instalment_amount')}
          />
          <div className="sm:mt-6">
            <CheckboxField
              label="Active"
              name="active"
              defaultChecked={plan?.active ?? true}
              description="Inactive plans still apply to their classes but aren't offered as a student override."
            />
          </div>
          <TextAreaField
            label="Notes"
            name="notes"
            rows={3}
            defaultValue={plan?.notes}
            className="sm:col-span-2"
            error={fieldError('notes')}
          />
        </FormGrid>
      </FormSection>

      <fieldset className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <legend className="sr-only">Classes</legend>
        <h2 className="text-sm font-semibold text-gray-900">Classes</h2>
        <p className="mt-1 text-sm text-gray-500">
          Students in these classes pay this plan. A class can belong to one
          plan.
        </p>
        <div className="mt-4">
          {yearClasses.length === 0 ? (
            <p className="text-sm text-gray-400">
              No classes in this academic year.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {yearClasses.map((c) => {
                const owner = takenBy[c.id]
                return (
                  <li key={c.id} className="flex items-start gap-2">
                    <input
                      id={`class-${c.id}`}
                      name="class_ids"
                      type="checkbox"
                      value={c.id}
                      disabled={Boolean(owner)}
                      defaultChecked={plan?.class_ids.includes(c.id) ?? false}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <label
                      htmlFor={`class-${c.id}`}
                      className="text-sm text-gray-700"
                    >
                      {c.name}
                      <span className="block text-xs text-gray-400">
                        {owner ? `On ${owner}` : c.year_group}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </fieldset>

      <FormActions
        submitLabel={submitLabel}
        isPending={isPending}
        cancelHref="/finance?tab=fee-plans"
        error={error ?? undefined}
      />
    </form>
  )
}
