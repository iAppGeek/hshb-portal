import clsx from 'clsx'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@heroicons/react/20/solid'

import type { StatusLevel } from '@/lib/hrStatus'

import InfoPopover from './InfoPopover'

type Props = {
  level: StatusLevel
  /** Visible text beside the icon. */
  label: string
  /** Shown in a popover when the status is not ok. */
  reasons?: string[]
  className?: string
}

const ICONS = {
  ok: CheckCircleIcon,
  warning: ExclamationTriangleIcon,
  error: XCircleIcon,
} as const

const COLOURS: Record<StatusLevel, string> = {
  ok: 'text-green-700',
  warning: 'text-amber-700',
  error: 'text-red-700',
}

/**
 * A coloured status with an explanation in a popover (see InfoPopover).
 */
export default function StatusBadge({
  level,
  label,
  reasons = [],
  className,
}: Props): React.ReactElement {
  const Icon = ICONS[level]
  const content = (
    <>
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </>
  )
  const classes = clsx(
    'inline-flex items-center gap-1 font-medium whitespace-nowrap',
    COLOURS[level],
    className,
  )

  if (level === 'ok' || reasons.length === 0) {
    return (
      <span className={classes} data-level={level}>
        {content}
      </span>
    )
  }

  return (
    <InfoPopover
      className={classes}
      data-level={level}
      content={
        <ul className="list-disc space-y-1 pl-4">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      }
    >
      {content}
    </InfoPopover>
  )
}
