'use client'

import type { Header, RowData } from '@tanstack/react-table'
import { flexRender, Subscribe } from '@tanstack/react-table'
import {
  ChevronUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import type { ReactElement } from 'react'
import clsx from 'clsx'

import type { GridColumnMeta } from '@/lib/grid/columns'
import { th } from '@/lib/grid/styles'

import { features } from './features'

type Props<TData extends RowData> = {
  header: Header<typeof features, TData, unknown>
}

/**
 * A `<th>` for `FunctionalGrid`: a plain header for non-sortable columns, or
 * a button with `aria-sort` and a chevron for sortable ones. Reads sorting
 * state through `Subscribe` rather than `header.column.getIsSorted()`
 * directly, so a nested header stays live under the React Compiler (see
 * plans/shared-grids.md §2.5).
 */
export default function SortableTh<TData extends RowData>({
  header,
}: Props<TData>): ReactElement {
  const meta = (header.column.columnDef.meta ?? {}) as GridColumnMeta
  const className = clsx(th, meta.align === 'right' && 'text-right')

  if (header.isPlaceholder) {
    return <th scope="col" className={className} />
  }

  const headerContent = flexRender(
    header.column.columnDef.header,
    header.getContext(),
  )

  if (!header.column.getCanSort()) {
    return (
      <th
        scope="col"
        className={clsx(className, meta.srOnlyHeader && 'relative')}
      >
        {meta.srOnlyHeader ? (
          <span className="sr-only">{headerContent}</span>
        ) : (
          headerContent
        )}
      </th>
    )
  }

  return (
    <Subscribe
      source={header.column.table.store}
      selector={(state) => state.sorting}
    >
      {() => {
        const sorted = header.column.getIsSorted()
        return (
          <th
            scope="col"
            aria-sort={
              sorted === 'asc'
                ? 'ascending'
                : sorted === 'desc'
                  ? 'descending'
                  : 'none'
            }
            className={className}
          >
            <button
              type="button"
              onClick={header.column.getToggleSortingHandler()}
              className="inline-flex items-center gap-1 hover:text-gray-700"
            >
              {headerContent}
              {sorted === 'asc' ? (
                <ChevronUpIcon className="h-3 w-3" />
              ) : sorted === 'desc' ? (
                <ChevronDownIcon className="h-3 w-3" />
              ) : (
                <ChevronUpDownIcon className="h-3 w-3 text-gray-300" />
              )}
            </button>
          </th>
        )
      }}
    </Subscribe>
  )
}
