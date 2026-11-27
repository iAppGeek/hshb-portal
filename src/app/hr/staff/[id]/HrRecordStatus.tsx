import clsx from 'clsx'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@heroicons/react/20/solid'

import { STATUS_LABELS, type Status, type StatusLevel } from '@/lib/hrStatus'

const ICONS = {
  ok: CheckCircleIcon,
  warning: ExclamationTriangleIcon,
  error: XCircleIcon,
} as const

const PANEL: Record<StatusLevel, string> = {
  ok: 'bg-green-50 text-green-800 ring-green-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  error: 'bg-red-50 text-red-800 ring-red-200',
}

/** A person's overall HR status with every open issue listed beneath it. */
export default function HrRecordStatus({
  status,
}: {
  status: Status
}): React.ReactElement {
  const Icon = ICONS[status.level]
  return (
    <section
      aria-label="HR status"
      data-level={status.level}
      className={clsx(
        'mb-6 rounded-md p-4 text-sm ring-1',
        PANEL[status.level],
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        {status.level === 'ok'
          ? 'OK: no open issues'
          : `${STATUS_LABELS[status.level]}: ${status.reasons.length} open ${
              status.reasons.length === 1 ? 'issue' : 'issues'
            }`}
      </p>
      {status.reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-11">
          {status.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
