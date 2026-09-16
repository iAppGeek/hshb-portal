import type { ReactElement } from 'react'

import type { GridColumn, MobileMode, StackedRowSpec } from '@/lib/grid/columns'
import { tbody, thead, theadStacked } from '@/lib/grid/styles'

import EmptyRow from './EmptyRow'
import StackedRow from './StackedRow'
import Table from './Table'
import TableCard from './TableCard'
import Td from './Td'
import Th from './Th'
import Tr from './Tr'

type SimpleGridProps<T> = {
  columns: GridColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  mobile?: MobileMode // default 'scroll'
  stacked?: StackedRowSpec<T> // required when mobile = 'stacked'
  frame?: 'card' | 'none' // default 'card'
  density?: 'comfortable' | 'compact'
  emptyMessage?: string // EmptyRow when rows is empty
  rowClassName?: (row: T) => string | undefined
  caption?: string // sr-only <caption>
}

/**
 * A server-rendered, JavaScript-free `<table>` built from shared parts and
 * style tokens. Never sorts, filters or manages state — pages that need
 * that reach for `FunctionalGrid` instead.
 */
export default function SimpleGrid<T>({
  columns,
  rows,
  getRowKey,
  mobile = 'scroll',
  stacked,
  frame = 'card',
  emptyMessage,
  rowClassName,
  caption,
}: SimpleGridProps<T>): ReactElement {
  if (mobile === 'stacked' && !stacked) {
    throw new Error(
      'SimpleGrid: `stacked` is required when `mobile` is "stacked"',
    )
  }

  const isStacked = mobile === 'stacked'
  const showEmptyRow = rows.length === 0 && Boolean(emptyMessage)

  return (
    <TableCard frame={frame}>
      <Table caption={caption}>
        <thead className={isStacked ? theadStacked : thead}>
          <tr>
            {columns.map((col) => (
              <Th key={col.id} meta={col}>
                {col.header}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody className={tbody}>
          {showEmptyRow ? (
            <EmptyRow colSpan={columns.length} message={emptyMessage!} />
          ) : (
            rows.map((row) =>
              isStacked && stacked ? (
                <StackedRow
                  key={getRowKey(row)}
                  row={row}
                  columns={columns}
                  spec={stacked}
                />
              ) : (
                <Tr key={getRowKey(row)} className={rowClassName?.(row)}>
                  {columns.map((col, i) => (
                    <Td key={col.id} mobile={mobile} meta={col}>
                      {col.cell(row, i)}
                    </Td>
                  ))}
                </Tr>
              ),
            )
          )}
        </tbody>
      </Table>
    </TableCard>
  )
}
