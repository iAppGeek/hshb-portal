import { type Metadata } from 'next'

import { requireRole } from '@/auth/require'
import { canManageHr } from '@/lib/permissions'

import StaffPayrollList from './_components/StaffPayrollList'

export const metadata: Metadata = { title: 'HR' }

export default async function HrPage(): Promise<React.ReactElement> {
  await requireRole(canManageHr)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">HR</h1>
        <p className="mt-1 text-sm text-gray-500">
          Staff payroll and compliance records.
        </p>
      </div>

      <StaffPayrollList />
    </div>
  )
}
