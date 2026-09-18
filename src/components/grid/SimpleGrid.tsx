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

type MobileProps<T> =
  | { mobile?: 'scroll' | 'hide-columns'; stacked?: never }
  | { mobile: 'stacked'; stacked: StackedRowSpec<T> }

type SimpleGridProps<T> = {
  columns: GridColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  frame?: 'card' | 'none' // default 'card'
  emptyMessage?: string // EmptyRow when rows is empty
  rowClassName?: (row: T) => string | undefined
  caption?: string // sr-only <caption>
} & MobileProps<T>

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
  const isStacked = mobile === 'stacked'
  const mobileMode: MobileMode = mobile

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
          {rows.length === 0 && emptyMessage ? (
            <EmptyRow colSpan={columns.length} message={emptyMessage} />
          ) : (
            rows.map((row) =>
              isStacked && stacked ? (
                <StackedRow
                  key={getRowKey(row)}
                  row={row}
                  columns={columns}
                  spec={stacked}
                  className={rowClassName?.(row)}
                />
              ) : (
                <Tr key={getRowKey(row)} className={rowClassName?.(row)}>
                  {columns.map((col) => (
                    <Td key={col.id} mobile={mobileMode} meta={col}>
                      {col.cell(row)}
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
