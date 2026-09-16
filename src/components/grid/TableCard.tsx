import type { ReactElement, ReactNode } from 'react'

import { card, scroll } from '@/lib/grid/styles'

type Props = {
  children: ReactNode
  /** 'none' when already inside a SectionCard / page card. Default 'card'. */
  frame?: 'card' | 'none'
}

export default function TableCard({
  children,
  frame = 'card',
}: Props): ReactElement {
  if (frame === 'none') {
    return <div className={scroll}>{children}</div>
  }

  return (
    <div className={card}>
      <div className={scroll}>{children}</div>
    </div>
  )
}
