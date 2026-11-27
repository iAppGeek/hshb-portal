import Link from 'next/link'
import { ShieldCheckIcon } from '@heroicons/react/24/outline'

import StatusBadge from '@/components/StatusBadge'
import { STATUS_LABELS } from '@/lib/hrStatus'

import { loadHrCompliance } from '../hr/_lib/loadHrCompliance'

/**
 * The school's overall HR compliance and how many things need sorting out,
 * linking to the HR page for the detail. Shown only to those who can open it.
 */
export default async function HrComplianceTile({
  today,
}: {
  today: string
}): Promise<React.ReactElement> {
  const { summary } = await loadHrCompliance(today)
  const { overall, pendingActions } = summary
  return (
    <Link
      href="/hr"
      className="group xs:flex-row xs:items-center xs:gap-3 flex flex-col items-start gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md sm:gap-4 sm:p-6"
    >
      <div className="rounded-lg bg-blue-50 p-2 transition group-hover:bg-blue-100 sm:p-3">
        <ShieldCheckIcon className="h-5 w-5 text-blue-600 sm:h-6 sm:w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500">HR compliance</p>
        <StatusBadge
          level={overall.level}
          label={STATUS_LABELS[overall.level]}
          wrap
          className="mt-0.5 text-base"
        />
        <p className="text-sm text-gray-500">
          {pendingActions === 0
            ? 'No pending actions'
            : `${pendingActions} pending ${pendingActions === 1 ? 'action' : 'actions'}`}
        </p>
      </div>
    </Link>
  )
}
