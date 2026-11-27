import ComplianceSummaryCard from '@/components/ComplianceSummaryCard'

import { loadHrCompliance } from '../hr/_lib/loadHrCompliance'

/** The HR compliance summary for admins, linking through to the HR page. */
export default async function HrComplianceTile({
  today,
}: {
  today: string
}): Promise<React.ReactElement> {
  const { summary } = await loadHrCompliance(today)
  return (
    <div className="col-span-2">
      <ComplianceSummaryCard summary={summary} href="/hr" />
    </div>
  )
}
