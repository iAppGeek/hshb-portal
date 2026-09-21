import type { ReactNode } from 'react'

export type RegisterHeaderInfo = {
  className: string
  date: string
  dateLabel: 'Today' | 'Historical' | 'Future'
  /** Rendered at the end of the line, e.g. the "Email class" dropdown. */
  actions?: ReactNode
}

type Props = RegisterHeaderInfo & {
  /** Attendance has been saved for this class and date. */
  taken: boolean
}

export default function RegisterHeader({
  className,
  date,
  dateLabel,
  actions,
  taken,
}: Props): React.JSX.Element {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-500">
      <span>
        {className} &mdash; {date}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${dateLabel === 'Today' ? 'bg-green-500' : 'bg-amber-500'}`}
      >
        {dateLabel}
      </span>
      {taken && (
        <span className="text-green-600">(register already taken)</span>
      )}
      {actions && <div className="ml-auto sm:ml-0">{actions}</div>}
    </div>
  )
}
