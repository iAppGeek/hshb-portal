import { type ReactNode } from 'react'
import { type Metadata } from 'next'

import { requireRouteAccess } from '@/auth/require'
import { getAcademicYears, getCurrentAcademicYear } from '@/db'
import { resolveYearId } from '@/lib/academicYears'

import PageHeader from '../_components/PageHeader'
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
  await requireRouteAccess('/finance')

  const { tab = DEFAULT_TAB, year } = await searchParams
  const [years, currentYear] = await Promise.all([
    getAcademicYears(),
    getCurrentAcademicYear(),
  ])
  const yearId = resolveYearId(years, year, currentYear.id)

  return (
    <div>
      <PageHeader
        title="Finance"
        subtitle="Student fees and fee plans for the selected academic year."
        action={
          <YearSelector
            years={years}
            value={yearId}
            basePath="/finance"
            extraParams={{ tab }}
          />
        }
      />

      <FinanceTabBar currentTab={tab} yearId={yearId} />

      {tab === 'students' && <StudentFeesTab yearId={yearId} />}
      {tab === 'fee-plans' && <FeePlansTab yearId={yearId} />}
    </div>
  )
}
