import type { ReactNode } from 'react'

export type MobileMode = 'scroll' | 'hide-columns' | 'stacked'

export type GridColumnMeta = {
  className?: string
  align?: 'left' | 'right'
  mobile?: 'show' | 'hide' // used by mobile: 'hide-columns'
  srOnlyHeader?: boolean // "Actions" columns
}

export type GridColumn<T> = GridColumnMeta & {
  id: string
  header: string
  cell: (row: T, index: number) => ReactNode
}

export type StackedRowSpec<T> = {
  title: (row: T) => ReactNode
  titleAside?: (row: T) => ReactNode // e.g. Edit link, status badge
  details: (row: T) => ReactNode[] // joined with ' · '
  detailsAside?: (row: T) => ReactNode // e.g. Details button
}

/**
 * Extra classes for a cell beyond the base density/visibility class the
 * caller already applies. In 'hide-columns' mode, columns marked
 * `mobile: 'hide'` collapse below `sm`; every other mode/meta combination
 * only contributes alignment and any caller-supplied className.
 */
export function cellClassName(
  meta: GridColumnMeta,
  mobile: MobileMode,
): string {
  const classes: string[] = []
  if (mobile === 'hide-columns' && meta.mobile === 'hide') {
    classes.push('hidden sm:table-cell')
  }
  if (meta.align === 'right') {
    classes.push('text-right')
  }
  if (meta.className) {
    classes.push(meta.className)
  }
  return classes.join(' ')
}
