import type { ReactElement } from 'react'

import type { GridColumn, StackedRowSpec } from '@/lib/grid/columns'
import { stackedTitle, tdStackedSummary } from '@/lib/grid/styles'

import Td from './Td'
import Tr from './Tr'

type Props<T> = {
  row: T
  columns: GridColumn<T>[]
  spec: StackedRowSpec<T>
  className?: string
}

/**
 * One stacked-mobile row: a single `sm:hidden` summary cell built from
 * `spec`, followed by the same desktop cells every other mobile mode uses
 * (rendered `hidden sm:table-cell` by `Td`).
 */
export default function StackedRow<T>({
  row,
  columns,
  spec,
  className,
}: Props<T>): ReactElement {
  const details = spec.details(row)
  const hasDetailsLine = details.length > 0 || Boolean(spec.detailsAside)

  return (
    <Tr stacked className={className}>
      <td className={tdStackedSummary}>
        <div className="flex items-center justify-between gap-2">
          <div className={stackedTitle}>{spec.title(row)}</div>
          {spec.titleAside ? (
            <div className="shrink-0">{spec.titleAside(row)}</div>
          ) : null}
        </div>
        {hasDetailsLine ? (
          <div className="mt-1 flex items-start justify-between gap-2">
            <div className="text-xs text-gray-500">
              {details.map((detail, i) => (
                <span key={i}>
                  {i > 0 ? ' · ' : null}
                  {detail}
                </span>
              ))}
            </div>
            {spec.detailsAside ? (
              <div className="shrink-0">{spec.detailsAside(row)}</div>
            ) : null}
          </div>
        ) : null}
      </td>
      {columns.map((col) => (
        <Td key={col.id} mobile="stacked" meta={col}>
          {col.cell(row)}
        </Td>
      ))}
    </Tr>
  )
}
