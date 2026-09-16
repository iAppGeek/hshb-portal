import type { ReactElement, ReactNode } from 'react'
import clsx from 'clsx'

import {
  cellClassName,
  type GridColumnMeta,
  type MobileMode,
} from '@/lib/grid/columns'
import { td, tdPrimary, tdVisible } from '@/lib/grid/styles'

type Props = {
  children: ReactNode
  mobile: MobileMode
  meta?: GridColumnMeta
  /** The bold, always-visible primary column (e.g. a name cell). */
  primary?: boolean
}

export default function Td({
  children,
  mobile,
  meta = {},
  primary = false,
}: Props): ReactElement {
  // In 'stacked' mode every column becomes a desktop-only cell — the mobile
  // summary is rendered separately by StackedRow — so it always collapses
  // below `sm` regardless of column meta.
  const base = mobile === 'stacked' ? td : primary ? tdPrimary : tdVisible

  return <td className={clsx(base, cellClassName(meta, mobile))}>{children}</td>
}
