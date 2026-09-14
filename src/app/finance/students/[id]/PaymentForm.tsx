'use client'

import { useState, useTransition } from 'react'

import {
  academicYearForDate,
  type AcademicYearRange,
} from '@/lib/academicYears'
import { PAYMENT_METHOD_LABELS } from '@/lib/fees'
import type { ActionResult } from '@/lib/schemas'

export type PaymentFormYear = AcademicYearRange & { id: string }

type Props = {
  defaultDate: string
  years: PaymentFormYear[]
  currentYearId: string
  action: (formData: FormData) => Promise<ActionResult>
}

const INPUT =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
const LABEL = 'block text-sm font-medium text-gray-700'

export default function PaymentForm({
  defaultDate,
  years,
  currentYearId,
  action,
}: Props): React.ReactElement {
  const [date, setDate] = useState(defaultDate)
  const [yearId, setYearId] = useState(
    academicYearForDate(years, defaultDate)?.id ?? currentYearId,
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const value = e.target.value
    setDate(value)
    setYearId(academicYearForDate(years, value)?.id ?? currentYearId)
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await action(new FormData(form))
      if (result?.error) {
        setError(result.error)
      } else {
        form.reset()
        setDate(defaultDate)
        setYearId(academicYearForDate(years, defaultDate)?.id ?? currentYearId)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Record a payment">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor="amount" className={LABEL}>
            Amount (£)<span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            required
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="payment_date" className={LABEL}>
            Payment date<span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            id="payment_date"
            name="payment_date"
            type="date"
            required
            value={date}
            onChange={handleDateChange}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="academic_year_id" className={LABEL}>
            Pays for<span className="ml-0.5 text-red-500">*</span>
          </label>
          <select
            id="academic_year_id"
            name="academic_year_id"
            required
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
            className={INPUT}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="reference" className={LABEL}>
            Reference<span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            id="reference"
            name="reference"
            type="text"
            required
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="method" className={LABEL}>
            Method<span className="ml-0.5 text-red-500">*</span>
          </label>
          <select id="method" name="method" required className={INPUT}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-4">
          <label htmlFor="payment_notes" className={LABEL}>
            Payment notes
          </label>
          <input
            id="payment_notes"
            name="notes"
            type="text"
            className={INPUT}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? 'Recording…' : 'Record payment'}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}
