import { LEAVING_REASON_LABELS, type LeavingReason } from '@/lib/schemas'

export default function LeaverBadge({ reason }: { reason: string | null }) {
  const label =
    LEAVING_REASON_LABELS[reason as LeavingReason] ?? LEAVING_REASON_LABELS.left

  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      {label}
    </span>
  )
}
