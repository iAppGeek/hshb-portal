import type { ReactElement, ReactNode } from 'react'
import clsx from 'clsx'

import {
  cellClassName,
  type GridColumnMeta,
  type MobileMode,
} from '@/lib/grid/columns'
import { td, tdPrimary, tdPrimaryHidden, tdVisible } from '@/lib/grid/styles'

type Props = {
  children: ReactNode
  mobile: MobileMode
  meta?: GridColumnMeta
  /**
   * The bold, always-visible primary column (e.g. a Name column). Falls
   * back to `meta.primary` when not given explicitly.
   */
  primary?: boolean
}

export default function Td({
  children,
  mobile,
  meta = {},
  primary,
}: Props): ReactElement {
  const isPrimary = primary ?? meta.primary ?? false
  // In 'stacked' mode every column becomes a desktop-only cell — the mobile
  // summary is rendered separately by StackedRow — so it always collapses
  // below `sm` regardless of column meta. It can still be bold/primary.
  const base =
    mobile === 'stacked'
      ? isPrimary
        ? tdPrimaryHidden
        : td
      : isPrimary
        ? tdPrimary
        : tdVisible

  return <td className={clsx(base, cellClassName(meta, mobile))}>{children}</td>
}
