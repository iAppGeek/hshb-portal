import { type ReactNode } from 'react'
import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { canManageFinance } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import FinanceTabBar from './_components/FinanceTabBar'
import FeePlansTab from './_tabs/fee-plans/FeePlansTab'
import StaffPayrollTab from './_tabs/staff/StaffPayrollTab'
import StudentFeesTab from './_tabs/students/StudentFeesTab'

export const metadata: Metadata = { title: 'Finance' }

const DEFAULT_TAB = 'staff'

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}): Promise<ReactNode> {
  const session = await auth()
  const role = session?.user?.role as StaffRole | undefined

  if (!role || !canManageFinance(role)) {
    redirect('/dashboard')
  }

  const { tab = DEFAULT_TAB } = await searchParams

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
        <p className="mt-1 text-sm text-gray-500">
          Staff payroll and compliance, student fees and fee plans.
        </p>
      </div>

      <FinanceTabBar currentTab={tab} />

      {tab === 'staff' && <StaffPayrollTab />}
      {tab === 'students' && <StudentFeesTab />}
      {tab === 'fee-plans' && <FeePlansTab />}
    </div>
  )
}
