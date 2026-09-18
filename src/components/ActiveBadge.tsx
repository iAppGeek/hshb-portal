import type { ReactElement } from 'react'

type Props = {
  active: boolean
}

export default function ActiveBadge({ active }: Props): ReactElement {
  return active ? (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      Inactive
    </span>
  )
}
