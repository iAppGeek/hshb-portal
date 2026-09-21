'use client'

import { useState, useTransition } from 'react'

import type { ActionResult } from '@/lib/action'

type Props = {
  yearCode: string
  action: () => Promise<ActionResult>
}

export default function MakeCurrentButton({
  yearCode,
  action,
}: Props): React.ReactElement {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick(): void {
    if (!confirm(`Make ${yearCode} the current academic year?`)) return
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) setError(result.error)
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-blue-600 hover:text-blue-800 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? 'Setting…' : 'Make current'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
