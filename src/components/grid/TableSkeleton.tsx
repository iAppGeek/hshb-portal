import type { ReactElement } from 'react'

import { tbody, tdBase, th, thead } from '@/lib/grid/styles'

import Table from './Table'
import TableCard from './TableCard'

type Props = {
  columns: number
  rows?: number
  widths?: string[]
  frame?: 'card' | 'none'
}

const DEFAULT_ROWS = 6
const DEFAULT_WIDTH = '4rem'

/** A hand-drawn loading skeleton matching SimpleGrid's card/scroll/table shape. */
export default function TableSkeleton({
  columns,
  rows = DEFAULT_ROWS,
  widths,
  frame = 'card',
}: Props): ReactElement {
  return (
    <TableCard frame={frame} className="animate-pulse">
      <Table>
        <thead className={thead}>
          <tr>
            {Array.from({ length: columns }).map((_, c) => (
              <th key={c} className={th}>
                <div className="h-3 w-16 rounded bg-gray-200" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={tbody}>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c} className={tdBase}>
                  <div
                    className="h-4 rounded bg-gray-200"
                    style={{ width: widths?.[c] ?? DEFAULT_WIDTH }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </TableCard>
  )
}
