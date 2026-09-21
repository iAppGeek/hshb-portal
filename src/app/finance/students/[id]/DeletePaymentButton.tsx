'use client'

import { useState, useTransition } from 'react'

import type { ActionResult } from '@/lib/action'

type Props = {
  paymentId: string
  reference: string
  action: (paymentId: string) => Promise<ActionResult>
}

export default function DeletePaymentButton({
  paymentId,
  reference,
  action,
}: Props): React.ReactElement {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick(): void {
    if (
      !window.confirm(`Delete payment ${reference}? This cannot be undone.`)
    ) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await action(paymentId)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-label={`Delete payment ${reference}`}
        className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        {isPending ? 'Deleting…' : 'Delete'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
