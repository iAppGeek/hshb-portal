import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { canManageHr } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import StaffPayrollList from './_components/StaffPayrollList'

export const metadata: Metadata = { title: 'HR' }

export default async function HrPage(): Promise<React.ReactElement> {
  const session = await auth()
  const role = session?.user?.role as StaffRole | undefined

  if (!role || !canManageHr(role)) {
    redirect('/dashboard')
  }

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
