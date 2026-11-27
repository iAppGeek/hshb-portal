import {
  MIN_FIRE_WARDENS,
  MIN_FIRST_AIDERS,
  STATUS_LABELS,
  type ComplianceSummary,
} from '@/lib/hrStatus'

import StatusBadge from './StatusBadge'

type Props = {
  summary: ComplianceSummary
}

/** The HR compliance summary at the top of the HR page. */
export default function ComplianceSummaryCard({
  summary,
}: Props): React.ReactElement {
  const { overall, staff, staffStatus, firstAiders, fireWardens } = summary
  const title = 'HR compliance'

  return (
    <section
      aria-label={title}
      className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-gray-500">{title}</h2>
        <StatusBadge
          level={overall.level}
          label={STATUS_LABELS[overall.level]}
          reasons={overall.reasons}
        />
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <SummaryItem label="Staff">
          <StatusBadge
            level={staffStatus.level}
            label={`${staff.ok} OK · ${staff.warning} warning · ${staff.error} action`}
            reasons={staffStatus.reasons}
          />
        </SummaryItem>
        <SummaryItem label="First aiders">
          <StatusBadge
            level={firstAiders.status.level}
            label={`${firstAiders.count} of ${MIN_FIRST_AIDERS}`}
            reasons={firstAiders.status.reasons}
          />
        </SummaryItem>
        <SummaryItem label="Fire wardens">
          <StatusBadge
            level={fireWardens.status.level}
            label={`${fireWardens.count} of ${MIN_FIRE_WARDENS}`}
            reasons={fireWardens.status.reasons}
          />
        </SummaryItem>
      </dl>
    </section>
  )
}

function SummaryItem({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:justify-start">
      <dt className="text-gray-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
