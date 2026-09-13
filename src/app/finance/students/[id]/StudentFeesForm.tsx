'use client'

import { useState, useTransition } from 'react'

import type { StudentFeeAccountRow } from '@/db'
import { PAYMENT_PLAN_LABELS } from '@/lib/fees'
import type { ActionResult } from '@/lib/schemas'

type Props = {
  account: StudentFeeAccountRow | null
  planOptions: { id: string; label: string }[]
  action: (formData: FormData) => Promise<ActionResult>
}

const INPUT =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
const LABEL = 'block text-sm font-medium text-gray-700'

export default function StudentFeesForm({
  account,
  planOptions,
  action,
}: Props): React.ReactElement {
  const [paymentPlan, setPaymentPlan] = useState(account?.payment_plan ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isCustom = paymentPlan === 'custom'

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await action(new FormData(form))
      if (result?.error) setError(result.error)
      else setSaved(true)
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
    >
      <h2 className="text-sm font-semibold text-gray-900">Fee account</h2>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="payment_plan" className={LABEL}>
            Payment plan
          </label>
          <select
            id="payment_plan"
            name="payment_plan"
            value={paymentPlan}
            onChange={(e) => setPaymentPlan(e.target.value)}
            className={INPUT}
          >
            <option value="">No payment plan</option>
            {Object.entries(PAYMENT_PLAN_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="fee_plan_override_id" className={LABEL}>
            Fee plan override
          </label>
          <select
            id="fee_plan_override_id"
            name="fee_plan_override_id"
            defaultValue={account?.fee_plan_override_id ?? ''}
            className={INPUT}
          >
            <option value="">Use the plan from their classes</option>
            {planOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Hidden rather than unmounted so the fields are always submitted */}
        <div hidden={!isCustom}>
          <label htmlFor="custom_total_amount" className={LABEL}>
            Agreed total (£)
          </label>
          <input
            id="custom_total_amount"
            name="custom_total_amount"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={account?.custom_total_amount ?? ''}
            className={INPUT}
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
          <label htmlFor="payment_plan_notes" className={LABEL}>
            Notes
          </label>
          <textarea
            id="payment_plan_notes"
            name="payment_plan_notes"
            rows={3}
            defaultValue={account?.payment_plan_notes ?? ''}
            className={INPUT}
          />
          {isCustom && (
            <p className="mt-1 text-xs text-gray-500">
              Required for a custom plan: explain the agreed arrangement.
            </p>
          )}
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
