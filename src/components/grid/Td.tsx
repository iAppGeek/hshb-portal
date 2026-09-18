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
}

export default function Td({
  children,
  mobile,
  meta = {},
}: Props): ReactElement {
  return <td className={cellClassName(meta, mobile)}>{children}</td>
}
