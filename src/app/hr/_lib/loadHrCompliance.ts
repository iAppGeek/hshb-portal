import 'server-only'

import {
  getAcademicYears,
  getStaffPayrollList,
  type StaffPayrollListItem,
} from '@/db'
import {
  complianceSummary,
  type ComplianceSummary,
  type SchoolYear,
} from '@/lib/hrStatus'

export type HrCompliance = {
  staff: StaffPayrollListItem[]
  year: SchoolYear | null
  summary: ComplianceSummary
}

/** Staff with their HR records, the current school year and the summary. */
export async function loadHrCompliance(today: string): Promise<HrCompliance> {
  const [staff, years] = await Promise.all([
    getStaffPayrollList(),
    getAcademicYears(),
  ])
  const year = years.find((y) => y.is_current) ?? null
  return {
    staff,
    year,
    summary: complianceSummary(
      staff.map((member) => member.payroll),
      year,
      today,
    ),
  }
}
