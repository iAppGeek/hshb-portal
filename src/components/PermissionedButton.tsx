import type { ReactElement, ReactNode } from 'react'

import Tooltip from '@/components/Tooltip'

type Props = {
  allowed: boolean
  /** When not allowed: grey it out with `disabledReason` rather than hide it. */
  showDisabled: boolean
  disabledReason: string
  onClick: () => void
  /** Button classes, e.g. the blue primary or a white outline. */
  className: string
  children: ReactNode
}

const BASE = 'rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition'

/**
 * PermissionedLink's three states for an action that runs in place (opening a
 * dialog) rather than navigating.
 */
export default function PermissionedButton({
  allowed,
  showDisabled,
  disabledReason,
  onClick,
  className,
  children,
}: Props): ReactElement | null {
  if (allowed) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${BASE} ${className}`}
      >
        {children}
      </button>
    )
  }

  if (showDisabled) {
    return (
      <Tooltip text={disabledReason}>
        <span
          className={`${BASE} cursor-not-allowed bg-gray-100 text-gray-400 shadow-none`}
        >
          {children}
        </span>
      </Tooltip>
    )
  }

  return null
}
