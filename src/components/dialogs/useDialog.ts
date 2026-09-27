'use client'

import { useCallback, useState } from 'react'

type OpenArgs<P> = [P] extends [void] ? [] : [props: P]

export type DialogState<P> = {
  isOpen: boolean
  /** What `open` was called with; null while closed. */
  props: P | null
  open: (...args: OpenArgs<P>) => void
  close: () => void
}

/**
 * Open/closed state for one dialog. `P` is what the opener passes (e.g. the
 * row id), so a list needs one hook per dialog rather than one per row.
 */
export function useDialog<P = void>(): DialogState<P> {
  const [state, setState] = useState<{ props: P } | null>(null)

  const open = useCallback((...args: OpenArgs<P>): void => {
    setState({ props: args[0] as P })
  }, [])
  const close = useCallback((): void => setState(null), [])

  return {
    isOpen: state !== null,
    props: state ? state.props : null,
    open,
    close,
  }
}
