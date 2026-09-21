'use client'

import { useState } from 'react'

import type { StudentFeeAccountRow } from '@/db'
import { PAYMENT_PLAN_LABELS } from '@/lib/fees'
import type { ActionResult } from '@/lib/action'
import {
  CheckboxField,
  FieldError,
  SelectField,
  TextAreaField,
  TextField,
  formStyles,
  useServerForm,
} from '@/components/form'

type Props = {
  account: StudentFeeAccountRow | null
  academicYearId: string
  planOptions: { id: string; label: string }[]
  action: (formData: FormData) => Promise<ActionResult>
}

export default function StudentFeesForm({
  account,
  academicYearId,
  planOptions,
  action,
}: Props): React.ReactElement {
  const [paymentPlan, setPaymentPlan] = useState(account?.payment_plan ?? '')
  const [saved, setSaved] = useState(false)
  const isCustom = paymentPlan === 'custom'

  const { handleSubmit, isPending, error, fieldError } = useServerForm(
    async (fd) => {
      setSaved(false)
      const result = await action(fd)
      if (!result || !('error' in result)) setSaved(true)
      return result
    },
  )

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
    >
      <h2 className="text-sm font-semibold text-gray-900">Fee account</h2>
      <input type="hidden" name="academic_year_id" value={academicYearId} />

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="payment_plan" className={formStyles.label}>
            Payment plan
          </label>
          <select
            id="payment_plan"
            name="payment_plan"
            value={paymentPlan}
            onChange={(e) => setPaymentPlan(e.target.value)}
            aria-invalid={fieldError('payment_plan') ? true : undefined}
            aria-describedby={
              fieldError('payment_plan') ? 'payment_plan-error' : undefined
            }
            className={`${formStyles.input}${fieldError('payment_plan') ? ` ${formStyles.inputInvalid}` : ''}`}
          >
            <option value="">No payment plan</option>
            {Object.entries(PAYMENT_PLAN_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <FieldError
            id="payment_plan-error"
            error={fieldError('payment_plan')}
          />
        </div>

        <SelectField
          label="Fee plan override"
          name="fee_plan_override_id"
          defaultValue={account?.fee_plan_override_id}
          placeholder="Use the plan from their classes"
          options={planOptions.map((p) => ({ value: p.id, label: p.label }))}
          error={fieldError('fee_plan_override_id')}
        />

        {/* Hidden rather than unmounted so the fields are always submitted */}
        <div hidden={!isCustom}>
          <TextField
            label="Agreed total (£)"
            name="custom_total_amount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={account?.custom_total_amount?.toString()}
            error={fieldError('custom_total_amount')}
          />
        </div>
        <div hidden={!isCustom} className="flex items-center gap-2 sm:mt-6">
          <input
            id="custom_up_to_date"
            name="custom_up_to_date"
            type="checkbox"
            defaultChecked={account?.custom_up_to_date ?? false}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label
            htmlFor="custom_up_to_date"
            className="text-sm font-medium text-gray-700"
          >
            Up to date with the custom arrangement
          </label>
        </div>

        <div className="sm:col-span-2">
          <TextAreaField
            label="Notes"
            name="payment_plan_notes"
            rows={3}
            defaultValue={account?.payment_plan_notes}
            hint={
              isCustom
                ? 'Required for a custom plan: explain the agreed arrangement.'
                : undefined
            }
            error={fieldError('payment_plan_notes')}
          />
        </div>

        <CheckboxField
          label="Settled (written off or agreed as paid)"
          name="settled"
          defaultChecked={account?.settled ?? false}
        />
        <div className="sm:col-span-2">
          <TextAreaField
            label="Settled note"
            name="settled_note"
            rows={2}
            defaultValue={account?.settled_note}
            error={fieldError('settled_note')}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save fee account'}
        </button>
        {saved && (
          <p role="status" className="text-sm text-green-700">
            Saved
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}
