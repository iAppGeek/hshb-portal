import Tooltip from '@/components/Tooltip'

type Props = {
  label: string
  /** Render the button. */
  allowed: boolean
  /** When not allowed: grey it out with `disabledReason` rather than hide it. */
  showDisabled: boolean
  disabledReason: string
  onClick: () => void
  className: string
}

/** An action on a review page: enabled, greyed out with a reason, or hidden. */
export default function ReviewActionButton({
  label,
  allowed,
  showDisabled,
  disabledReason,
  onClick,
  className,
}: Props): React.ReactElement | null {
  if (allowed) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition ${className}`}
      >
        {label}
      </button>
    )
  }

  if (showDisabled) {
    return (
      <Tooltip text={disabledReason}>
        <span className="cursor-not-allowed rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400">
          {label}
        </span>
      </Tooltip>
    )
  }

  return null
}
