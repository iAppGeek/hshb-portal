import { type Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireRouteAccess } from '@/auth/require'
import {
  getAcademicYears,
  getAllStaff,
  getStaffById,
  getStaffPayrollByStaffId,
} from '@/db'
import { todayInSchoolTz } from '@/lib/datetime'
import { staffComplianceStatus } from '@/lib/hrStatus'

import PageHeader from '../../../_components/PageHeader'

import HrRecordStatus from './HrRecordStatus'
import StaffPayrollForm from './StaffPayrollForm'
import { saveStaffPayrollAction } from './actions'

export const metadata: Metadata = { title: 'Staff Payroll' }

export default async function StaffPayrollPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactElement> {
  await requireRouteAccess('/hr')

  const { id } = await params
  const [staff, payroll, allStaff, years] = await Promise.all([
    getStaffById(id),
    getStaffPayrollByStaffId(id),
    getAllStaff(),
    getAcademicYears(),
  ])

  if (!staff) {
    notFound()
  }

  function nameOf(staffId: string | null): string | null {
    const member = allStaff.find((s) => s.id === staffId)
    return member ? `${member.first_name} ${member.last_name}` : null
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`${staff.title} ${staff.first_name} ${staff.last_name}`}
        subtitle={
          payroll
            ? 'Payroll and compliance record.'
            : 'No payroll record yet. Role, date of birth and payment funding are required to create one.'
        }
        backHref="/hr"
        backLabel="HR"
      />

      {payroll && (
        <HrRecordStatus
          status={staffComplianceStatus(
            payroll,
            years.find((y) => y.is_current) ?? null,
            todayInSchoolTz(),
          )}
        />
      )}

      <StaffPayrollForm
        payroll={payroll}
        idVerifiedByName={nameOf(payroll?.id_verified_by ?? null)}
        dbsVerifiedByName={nameOf(payroll?.dbs_verified_by ?? null)}
        action={saveStaffPayrollAction.bind(null, staff.id)}
      />
    </div>
  )
}
