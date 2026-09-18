import type { ReactElement } from 'react'

type Props = {
  count: number
  total: number
  noun: string
}

/** "Showing X of Y {noun}" — shown above a `FunctionalGrid` when `showCount` is set. */
export default function ResultCount({
  count,
  total,
  noun,
}: Props): ReactElement {
  return (
    <p className="text-sm text-gray-500">
      Showing {count} of {total} {noun}
    </p>
  )
}
