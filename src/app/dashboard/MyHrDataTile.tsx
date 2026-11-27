import { IdentificationIcon } from '@heroicons/react/24/outline'

import StatusBadge from '@/components/StatusBadge'
import { getAcademicYears, getStaffPayrollByStaffId } from '@/db'
import {
  ISSUE_CATEGORY_LABELS,
  STATUS_LABELS,
  staffComplianceStatus,
  staffIssueCategories,
} from '@/lib/hrStatus'

/**
 * The signed-in person's own HR status. They cannot see or edit the record,
 * so open issues name only the area affected (DBS, personal data, ...) and
 * point them to the Committee.
 */
export default async function MyHrDataTile({
  staffId,
  today,
}: {
  staffId: string
  today: string
}): Promise<React.ReactElement> {
  const [payroll, years] = await Promise.all([
    getStaffPayrollByStaffId(staffId),
    getAcademicYears(),
  ])
  const year = years.find((y) => y.is_current) ?? null
  const status = staffComplianceStatus(payroll, year, today)
  const categories = staffIssueCategories(payroll, year, today)

  return (
    <section
      aria-label="HR Data"
      className="xs:flex-row xs:items-center xs:gap-3 flex flex-col items-start gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:gap-4 sm:p-6"
    >
      <div className="rounded-lg bg-blue-50 p-2 sm:p-3">
        <IdentificationIcon className="h-5 w-5 text-blue-600 sm:h-6 sm:w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500">HR Data</p>
        <StatusBadge
          level={status.level}
          label={STATUS_LABELS[status.level]}
          wrap
          className="mt-0.5 text-base"
        />
        {categories.length > 0 && (
          <ul aria-label="Open issues" className="mt-1 space-y-0.5 text-sm">
            {categories.map(({ category, level }) => (
              <li key={category}>
                <StatusBadge
                  level={level}
                  label={ISSUE_CATEGORY_LABELS[category]}
                  wrap
                  className="font-normal [&_svg]:h-4 [&_svg]:w-4"
                />
              </li>
            ))}
          </ul>
        )}
        {status.level !== 'ok' && (
          <p className="mt-1 text-sm text-gray-500">
            Please contact the Committee.
          </p>
        )}
      </div>
    </section>
  )
}
