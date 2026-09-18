import type { ReactElement, ReactNode } from 'react'
import clsx from 'clsx'

import type { GridColumnMeta } from '@/lib/grid/columns'
import { th } from '@/lib/grid/styles'

type Props = {
  children: ReactNode
  meta?: GridColumnMeta
}

export default function Th({ children, meta }: Props): ReactElement {
  return (
    <th
      scope="col"
      className={clsx(
        th,
        meta?.align === 'right' && 'text-right',
        meta?.srOnlyHeader && 'relative',
        meta?.className,
      )}
    >
      {meta?.srOnlyHeader ? (
        <span className="sr-only">{children}</span>
      ) : (
        children
      )}
    </th>
  )
}
