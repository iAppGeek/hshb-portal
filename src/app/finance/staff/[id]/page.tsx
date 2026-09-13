import { type Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getAllStaff, getStaffById, getStaffPayrollByStaffId } from '@/db'
import { canManageFinance } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import StaffPayrollForm from './StaffPayrollForm'
import { saveStaffPayrollAction } from './actions'

export const metadata: Metadata = { title: 'Staff Payroll' }

export default async function StaffPayrollPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactElement> {
  const session = await auth()
  const role = session?.user?.role as StaffRole | undefined

  if (!role || !canManageFinance(role)) {
    redirect('/dashboard')
  }

  const { id } = await params
  const [staff, payroll, allStaff] = await Promise.all([
    getStaffById(id),
    getStaffPayrollByStaffId(id),
    getAllStaff(),
  ])

  if (!staff) {
    redirect('/finance?tab=staff')
  }

  function nameOf(staffId: string | null): string | null {
    const member = allStaff.find((s) => s.id === staffId)
    return member ? `${member.first_name} ${member.last_name}` : null
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link
          href="/finance?tab=staff"
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← Staff payroll
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          {staff.title} {staff.first_name} {staff.last_name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {payroll
            ? 'Payroll and compliance record.'
            : 'No payroll record yet. Payment funding is required to create one.'}
        </p>
      </div>

      <StaffPayrollForm
        payroll={payroll}
        idVerifiedByName={nameOf(payroll?.id_verified_by ?? null)}
        dbsVerifiedByName={nameOf(payroll?.dbs_verified_by ?? null)}
        action={saveStaffPayrollAction.bind(null, staff.id)}
      />
    </div>
  )
}
