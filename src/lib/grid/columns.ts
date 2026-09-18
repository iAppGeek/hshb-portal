import type { ReactNode } from 'react'
import clsx from 'clsx'

import { hiddenOnMobile, tdBase, tdDark, tdMuted, tdStrong } from './styles'

export type MobileMode = 'scroll' | 'hide-columns' | 'stacked'

export type GridColumnMeta = {
  className?: string
  align?: 'left' | 'right'
  mobile?: 'show' | 'hide' // used by mobile: 'hide-columns'
  srOnlyHeader?: boolean // "Actions" columns
  /** Bold, always-visible column (e.g. a Name column shown alongside a stacked mobile title). */
  primary?: boolean
  /** Plain (non-bold) dark text, for cells that read as primary content but aren't a name column. */
  dark?: boolean
}

export type GridColumn<T> = GridColumnMeta & {
  id: string
  header: string
  cell: (row: T) => ReactNode
}

export type StackedRowSpec<T> = {
  title: (row: T) => ReactNode
  titleAside?: (row: T) => ReactNode // e.g. Edit link, status badge
  details: (row: T) => ReactNode[] // joined with ' · '
  detailsAside?: (row: T) => ReactNode // e.g. Details button
}

/**
 * The single place that decides a cell's classes: base padding/text size,
 * then whether it collapses below `sm`, then whether it's bold (primary)
 * or muted, then alignment and any caller-supplied className.
 */
export function cellClassName(
  meta: GridColumnMeta,
  mobile: MobileMode,
): string {
  return clsx(
    tdBase,
    (mobile === 'stacked' ||
      (mobile === 'hide-columns' && meta.mobile === 'hide')) &&
      hiddenOnMobile,
    meta.primary ? tdStrong : meta.dark ? tdDark : tdMuted,
    meta.align === 'right' && 'text-right',
    meta.className,
  )
}
