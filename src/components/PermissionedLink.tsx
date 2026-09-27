import type { ReactElement, ReactNode } from 'react'
import Link from 'next/link'

import Tooltip from '@/components/Tooltip'
import { rowLink } from '@/lib/grid/styles'

type Props = {
  href: string
  allowed: boolean
  showDisabled: boolean
  disabledReason: string
  /** Link classes; default `rowLink`. */
  className?: string
  children: ReactNode
}

/** Grey, dimmed reading of an active-state className: no hover/transition, blue text greyed or a filled button dimmed via opacity. */
function toDisabledClassName(className: string): string {
  const withoutHover = className
    .split(' ')
    .filter((c) => c && c !== 'transition' && !c.startsWith('hover:'))
    .join(' ')
  if (withoutHover.includes('text-blue-600')) {
    return `cursor-not-allowed ${withoutHover.replace('text-blue-600', 'text-gray-400')}`
  }
  return `cursor-not-allowed ${withoutHover} opacity-50`
}

export default function PermissionedLink({
  href,
  allowed,
  showDisabled,
  disabledReason,
  className = rowLink,
  children,
}: Props): ReactElement | null {
  if (allowed) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    )
  }
  if (showDisabled) {
    return (
      <Tooltip text={disabledReason}>
        <span className={toDisabledClassName(className)}>{children}</span>
      </Tooltip>
    )
  }
  return null
}
