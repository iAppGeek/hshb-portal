'use client'

import { useState, useTransition } from 'react'

import type { ActionResult } from '@/lib/schemas'

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
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label
            htmlFor="code"
            className="block text-sm font-medium text-gray-700"
          >
            Code<span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            id="code"
            name="code"
            type="text"
            required
            readOnly={mode === 'edit'}
            defaultValue={defaultValues.code}
            placeholder="e.g. 2026-27"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm read-only:bg-gray-50 read-only:text-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="start_date"
            className="block text-sm font-medium text-gray-700"
          >
            Start date<span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            id="start_date"
            name="start_date"
            type="date"
            required
            defaultValue={defaultValues.start_date}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="end_date"
            className="block text-sm font-medium text-gray-700"
          >
            End date<span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            id="end_date"
            name="end_date"
            type="date"
            required
            defaultValue={defaultValues.end_date}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? 'Saving…' : submitLabel}
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  )
}
