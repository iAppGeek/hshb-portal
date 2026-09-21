import { type Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireRouteAccess } from '@/auth/require'
import { getAllStaff, getStaffById, getStaffPayrollByStaffId } from '@/db'

import PageHeader from '../../../_components/PageHeader'

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
  const [staff, payroll, allStaff] = await Promise.all([
    getStaffById(id),
    getStaffPayrollByStaffId(id),
    getAllStaff(),
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
            : 'No payroll record yet. Payment funding is required to create one.'
        }
        backHref="/hr"
        backLabel="HR"
      />

      <StaffPayrollForm
        payroll={payroll}
        idVerifiedByName={nameOf(payroll?.id_verified_by ?? null)}
        dbsVerifiedByName={nameOf(payroll?.dbs_verified_by ?? null)}
        action={saveStaffPayrollAction.bind(null, staff.id)}
      />
    </div>
  )
}
