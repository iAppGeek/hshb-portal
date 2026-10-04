'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type CopyStatus = 'idle' | 'copied' | 'failed'

export type CopyToClipboard = {
  status: CopyStatus
  copy: (text: string) => Promise<void>
}

/** How long "copied" shows before the button label reverts. */
export const COPIED_RESET_MS = 2000

/**
 * Copies text to the clipboard and reports the outcome for a button label.
 * "copied" reverts to "idle" after COPIED_RESET_MS; "failed" stays until the
 * next attempt. One status (not two flags) so a failure can never still read
 * as "copied", and one timer so a quick second copy is not cut short.
 */
export function useCopyToClipboard(): CopyToClipboard {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const timer = useRef<number | null>(null)

  const clearTimer = useCallback((): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  const copy = useCallback(
    async (text: string): Promise<void> => {
      clearTimer()
      setStatus('idle')
      try {
        await navigator.clipboard.writeText(text)
        setStatus('copied')
        timer.current = window.setTimeout(() => {
          timer.current = null
          setStatus('idle')
        }, COPIED_RESET_MS)
      } catch {
        setStatus('failed')
      }
    },
    [clearTimer],
  )

  return { status, copy }
}
