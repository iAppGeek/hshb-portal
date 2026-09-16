import type { ReactElement } from 'react'

import {
  card,
  scroll,
  table,
  tbody,
  tdVisible,
  th,
  thead,
} from '@/lib/grid/styles'

type Props = {
  columns: number
  rows?: number
  widths?: string[]
}

const DEFAULT_ROWS = 6
const DEFAULT_WIDTH = '4rem'

/** A hand-drawn loading skeleton matching SimpleGrid's card/scroll/table shape. */
export default function TableSkeleton({
  columns,
  rows = DEFAULT_ROWS,
  widths,
}: Props): ReactElement {
  return (
    <div className={`${card} animate-pulse`}>
      <div className={scroll}>
        <table className={table}>
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
                  // Skeleton cells are always visible on every viewport —
                  // there's no real data to hide on mobile — so this uses
                  // the always-visible `tdVisible` token, not `td`.
                  <td key={c} className={tdVisible}>
                    <div
                      className="h-4 rounded bg-gray-200"
                      style={{ width: widths?.[c] ?? DEFAULT_WIDTH }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
