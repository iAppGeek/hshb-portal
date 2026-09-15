'use client'

import { useState, useTransition } from 'react'

import { LEAVING_REASONS, LEAVING_REASON_LABELS } from '@/lib/schemas'

import { markStudentAsLeaverAction } from './actions'

export default function LeaverSection({ studentId }: { studentId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (
      !confirm(
        'Mark this student as a leaver? They will be removed from all classes today.',
      )
    ) {
      return
    }
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await markStudentAsLeaverAction(
        studentId,
        new FormData(form),
      )
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">Leaver</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
        <div>
          <label
            htmlFor="reason"
            className="block text-sm font-medium text-gray-700"
          >
            Reason
          </label>
          <select
            id="reason"
            name="reason"
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            {LEAVING_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {LEAVING_REASON_LABELS[reason]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Mark as leaver'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  )
}
