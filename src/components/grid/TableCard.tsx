import type { ReactElement, ReactNode } from 'react'
import clsx from 'clsx'

import { card, scroll } from '@/lib/grid/styles'

type Props = {
  children: ReactNode
  /** 'none' when already inside a SectionCard / page card. Default 'card'. */
  frame?: 'card' | 'none'
  className?: string
}

export default function TableCard({
  children,
  frame = 'card',
  className,
}: Props): ReactElement {
  if (frame === 'none') {
    return <div className={clsx(scroll, className)}>{children}</div>
  }

  return (
    <div className={clsx(card, className)}>
      <div className={scroll}>{children}</div>
    </div>
  )
}
