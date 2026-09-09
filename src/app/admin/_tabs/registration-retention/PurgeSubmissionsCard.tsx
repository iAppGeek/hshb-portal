'use client'

import { useState, useTransition } from 'react'

import { SUBMISSION_RETENTION_DAYS } from '@/lib/registration'

import { purgeActionedSubmissionsAction } from './actions'

export default function PurgeSubmissionsCard(): React.ReactElement {
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handlePurge(): void {
    setResult(null)
    setError(null)
    startTransition(async () => {
      const outcome = await purgeActionedSubmissionsAction()
      if ('error' in outcome) {
        setError(outcome.error)
      } else {
        setResult(
          outcome.removed === 1
            ? '1 record removed.'
            : `${outcome.removed} records removed.`,
        )
      }
    })
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <h2 className="text-sm font-semibold text-gray-900">
        Purge actioned registrations
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Removes registration submissions and photo opt-out requests that were
        actioned more than {SUBMISSION_RETENTION_DAYS} days ago. Student records
        are unaffected.
      </p>
      <button
        type="button"
        onClick={handlePurge}
        disabled={isPending}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? 'Purging…' : 'Purge now'}
      </button>
      {result && <p className="mt-2 text-sm text-green-700">{result}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
