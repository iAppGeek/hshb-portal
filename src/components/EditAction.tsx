import type { ReactElement } from 'react'
import Link from 'next/link'

import Tooltip from '@/components/Tooltip'

type Props = {
  href: string
  canEdit: boolean
  showDisabled: boolean
  noun: string
}

export default function EditAction({
  href,
  canEdit,
  showDisabled,
  noun,
}: Props): ReactElement | null {
  if (canEdit) {
    return (
      <Link href={href} className="text-gray-500 hover:text-gray-700">
        Edit
      </Link>
    )
  }
  if (showDisabled) {
    return (
      <Tooltip text={`You don't have permission to edit ${noun}`}>
        <span className="cursor-not-allowed text-gray-400">Edit</span>
      </Tooltip>
    )
  }
  return null
}
