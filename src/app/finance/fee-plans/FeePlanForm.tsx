'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'

import type { FeePlanWithClasses } from '@/db'
import type { ActionResult } from '@/lib/schemas'

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

const INPUT =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
const LABEL = 'block text-sm font-medium text-gray-700'

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
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const yearClasses = classes.filter(
    (c) => c.academic_year_id === academicYearId,
  )

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await action(new FormData(form))
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">
          Plan details
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className={LABEL}>
              Name<span className="ml-0.5 text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={plan?.name ?? ''}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="academic_year_id" className={LABEL}>
              Academic year<span className="ml-0.5 text-red-500">*</span>
            </label>
            <select
              id="academic_year_id"
              name="academic_year_id"
              required
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              className={INPUT}
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
          </div>
          <MoneyField
            label="Full year amount (£)"
            name="full_year_amount"
            defaultValue={plan?.full_year_amount}
          />
          <MoneyField
            label="Monthly instalment (£)"
            name="monthly_instalment_amount"
            defaultValue={plan?.monthly_instalment_amount}
          />
          <MoneyField
            label="Termly instalment (£)"
            name="termly_instalment_amount"
            defaultValue={plan?.termly_instalment_amount}
          />
          <div className="sm:mt-6">
            <div className="flex items-center gap-2">
              <input
                id="active"
                name="active"
                type="checkbox"
                defaultChecked={plan?.active ?? true}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="active"
                className="text-sm font-medium text-gray-700"
              >
                Active
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Inactive plans still apply to their classes but aren&apos;t
              offered as a student override.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="notes" className={LABEL}>
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={plan?.notes ?? ''}
              className={INPUT}
            />
          </div>
        </div>
      </div>

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

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? 'Saving…' : submitLabel}
        </button>
        <Link
          href="/finance?tab=fee-plans"
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Cancel
        </Link>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}

function MoneyField({
  label,
  name,
  defaultValue,
}: {
  label: string
  name: string
  defaultValue: number | undefined
}): React.ReactElement {
  return (
    <div>
      <label htmlFor={name} className={LABEL}>
        {label}
        <span className="ml-0.5 text-red-500">*</span>
      </label>
      <input
        id={name}
        name={name}
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        required
        defaultValue={defaultValue?.toFixed(2) ?? ''}
        className={INPUT}
      />
    </div>
  )
}
