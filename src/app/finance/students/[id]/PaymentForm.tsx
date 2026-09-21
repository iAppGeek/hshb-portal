'use client'

import { useRef, useState } from 'react'

import {
  academicYearForDate,
  type AcademicYearRange,
} from '@/lib/academicYears'
import { PAYMENT_METHOD_LABELS } from '@/lib/fees'
import type { ActionResult } from '@/lib/action'
import { SelectField, TextField, useServerForm } from '@/components/form'

export type PaymentFormYear = AcademicYearRange & { id: string }

type Props = {
  defaultDate: string
  years: PaymentFormYear[]
  /** Used when the payment date falls outside every known year. */
  defaultYearId: string
  action: (formData: FormData) => Promise<ActionResult<{ id: string }>>
}

export default function PaymentForm({
  defaultDate,
  years,
  defaultYearId,
  action,
}: Props): React.ReactElement {
  const formRef = useRef<HTMLFormElement>(null)
  const [date, setDate] = useState(defaultDate)
  const [yearId, setYearId] = useState(
    academicYearForDate(years, defaultDate)?.id ?? defaultYearId,
  )

  const { handleSubmit, isPending, error, fieldError } = useServerForm(
    async (fd) => {
      const result = await action(fd)
      if (!result || !('error' in result)) {
        formRef.current?.reset()
        setDate(defaultDate)
        setYearId(academicYearForDate(years, defaultDate)?.id ?? defaultYearId)
      }
      return result
    },
  )

  function handleDateChange(value: string): void {
    setDate(value)
    setYearId(academicYearForDate(years, value)?.id ?? defaultYearId)
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} aria-label="Record a payment">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <TextField
          label="Amount (£)"
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          error={fieldError('amount')}
        />
        <TextField
          label="Payment date"
          name="payment_date"
          type="date"
          required
          value={date}
          onChange={handleDateChange}
          error={fieldError('payment_date')}
        />
        <SelectField
          label="Pays for"
          name="academic_year_id"
          required
          value={yearId}
          onChange={setYearId}
          options={years.map((y) => ({ value: y.id, label: y.code }))}
          error={fieldError('academic_year_id')}
        />
        <TextField
          label="Reference"
          name="reference"
          required
          error={fieldError('reference')}
        />
        <SelectField
          label="Method"
          name="method"
          required
          options={Object.entries(PAYMENT_METHOD_LABELS).map(
            ([value, label]) => ({
              value,
              label,
            }),
          )}
          error={fieldError('method')}
        />
        <div className="sm:col-span-4">
          <TextField
            label="Payment notes"
            name="notes"
            error={fieldError('notes')}
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
