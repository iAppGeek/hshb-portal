import { type ReactNode } from 'react'
import { type Metadata } from 'next'

import { requireRole } from '@/auth/require'
import { getAcademicYears, getCurrentAcademicYear } from '@/db'
import { resolveYearId } from '@/lib/academicYears'
import { canManageFinance } from '@/lib/permissions'

import YearSelector from '../_components/YearSelector'

import FinanceTabBar from './_components/FinanceTabBar'
import FeePlansTab from './_tabs/fee-plans/FeePlansTab'
import StudentFeesTab from './_tabs/students/StudentFeesTab'

export const metadata: Metadata = { title: 'Finance' }

const DEFAULT_TAB = 'students'

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string }>
}): Promise<ReactNode> {
  await requireRole(canManageFinance)

  const { tab = DEFAULT_TAB, year } = await searchParams
  const [years, currentYear] = await Promise.all([
    getAcademicYears(),
    getCurrentAcademicYear(),
  ])
  const yearId = resolveYearId(years, year, currentYear.id)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
          <p className="mt-1 text-sm text-gray-500">
            Student fees and fee plans for the selected academic year.
          </p>
        </div>
        <YearSelector
          years={years}
          value={yearId}
          basePath="/finance"
          extraParams={{ tab }}
        />
      </div>

      <FinanceTabBar currentTab={tab} yearId={yearId} />

      {tab === 'students' && <StudentFeesTab yearId={yearId} />}
      {tab === 'fee-plans' && <FeePlansTab yearId={yearId} />}
    </div>
  )
}
