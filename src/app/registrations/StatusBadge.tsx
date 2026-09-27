const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  actioned: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

/** Review status of a registration or photo opt-out submission. */
export default function StatusBadge({
  status,
}: {
  status: string
}): React.ReactElement {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-800'}`}
    >
      {status}
    </span>
  )
}
