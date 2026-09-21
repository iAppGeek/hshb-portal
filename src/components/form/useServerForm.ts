'use client'

import { useCallback, useState, useTransition } from 'react'

import type { ActionResult } from '@/lib/action'

type UseServerFormOptions<T> = {
  onSuccess?: (data: T) => void
}

type UseServerFormResult = {
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isPending: boolean
  error: string | null
  fieldErrors: Record<string, string>
  fieldError: (name: string) => string | undefined
  reset: () => void
}

function scrollToFirstInvalid(form: HTMLFormElement): void {
  const invalid = form.querySelector('[aria-invalid="true"]')
  invalid?.scrollIntoView({ block: 'center' })
  if (invalid instanceof HTMLElement) invalid.focus()
}

export function useServerForm<T = unknown>(
  action: (formData: FormData) => Promise<ActionResult<T>>,
  options?: UseServerFormOptions<T>,
): UseServerFormResult {
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const form = e.currentTarget
      setError(null)
      setFieldErrors({})
      startTransition(async () => {
        const r = await action(new FormData(form))
        if (r && 'error' in r) {
          setError(r.error)
          setFieldErrors(r.fieldErrors ?? {})
          scrollToFirstInvalid(form)
        } else if (r && 'data' in r) {
          options?.onSuccess?.(r.data)
        }
      })
    },
    [action, options],
  )

  const fieldError = useCallback(
    (name: string) => fieldErrors[name],
    [fieldErrors],
  )

  const reset = useCallback(() => {
    setError(null)
    setFieldErrors({})
  }, [])

  return { handleSubmit, isPending, error, fieldErrors, fieldError, reset }
}
