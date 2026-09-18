import type { ReactElement, ReactNode } from 'react'
import clsx from 'clsx'

import { row, rowStacked } from '@/lib/grid/styles'

type Props = {
  children: ReactNode
  stacked?: boolean
  className?: string
  testId?: string
}

export default function Tr({
  children,
  stacked = false,
  className,
  testId,
}: Props): ReactElement {
  return (
    <tr
      className={clsx(stacked ? rowStacked : row, className)}
      data-testid={testId}
    >
      {children}
    </tr>
  )
}
