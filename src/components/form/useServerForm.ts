'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

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
  const formRef = useRef<HTMLFormElement | null>(null)
  const scrollPending = useRef(false)

  // The fields only get `aria-invalid` once React commits the new
  // `fieldErrors`, so the scroll has to wait for the commit rather than run
  // straight after `setFieldErrors`.
  useEffect(() => {
    if (!scrollPending.current) return
    scrollPending.current = false
    if (formRef.current) scrollToFirstInvalid(formRef.current)
  }, [fieldErrors])

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>): void => {
      e.preventDefault()
      const form = e.currentTarget
      formRef.current = form
      setError(null)
      setFieldErrors({})
      startTransition(async () => {
        const r = await action(new FormData(form))
        if (r && 'error' in r) {
          scrollPending.current = true
          setError(r.error)
          setFieldErrors(r.fieldErrors ?? {})
        } else if (r && 'data' in r) {
          options?.onSuccess?.(r.data)
        }
      })
    },
    [action, options],
  )

  const fieldError = useCallback(
    (name: string): string | undefined => fieldErrors[name],
    [fieldErrors],
  )

  const reset = useCallback((): void => {
    setError(null)
    setFieldErrors({})
  }, [])

  return { handleSubmit, isPending, error, fieldErrors, fieldError, reset }
}
