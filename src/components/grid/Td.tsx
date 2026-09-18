import type { ReactElement, ReactNode } from 'react'

import {
  cellClassName,
  type GridColumnMeta,
  type MobileMode,
} from '@/lib/grid/columns'

type Props = {
  children: ReactNode
  mobile: MobileMode
  meta?: GridColumnMeta
  /** Spans this cell across multiple columns, e.g. an inline edit row. */
  colSpan?: number
}

export default function Td({
  children,
  mobile,
  meta = {},
  colSpan,
}: Props): ReactElement {
  return (
    <td className={cellClassName(meta, mobile)} colSpan={colSpan}>
      {children}
    </td>
  )
}
