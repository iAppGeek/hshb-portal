import type { ReactElement } from 'react'

type Props = {
  colSpan: number
  message: string
}

/** A single row whose one cell spans every column, showing an empty-state message. */
export default function EmptyRow({ colSpan, message }: Props): ReactElement {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-3 py-6 text-center text-sm text-gray-500 sm:px-6"
      >
        {message}
      </td>
    </tr>
  )
}
