import clsx from 'clsx'

import { FEE_STATUS_LABELS, type FeeStatus } from '@/lib/fees'

const STYLES: Record<FeeStatus, string> = {
  paid_in_full: 'bg-green-100 text-green-800',
  up_to_date: 'bg-blue-100 text-blue-800',
  behind: 'bg-red-100 text-red-800',
  no_plan: 'bg-gray-100 text-gray-600',
}

export default function FeeStatusBadge({
  status,
}: {
  status: FeeStatus
}): React.ReactElement {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STYLES[status],
      )}
    >
      {FEE_STATUS_LABELS[status]}
    </span>
  )
}
