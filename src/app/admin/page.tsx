import { type ReactNode } from 'react'
import { type Metadata } from 'next'

import { requireRouteAccess } from '@/auth/require'

import PageHeader from '../_components/PageHeader'

import AdminTabBar from './_components/AdminTabBar'
import AcademicYearsTab from './_tabs/academic-years/AcademicYearsTab'
import ClassMigrationTab from './_tabs/class-migration/ClassMigrationTab'

export const metadata: Metadata = { title: 'Admin Tasks' }

const DEFAULT_TAB = 'class-migration'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string
    sourceClassId?: string
    targetYearId?: string
  }>
}): Promise<ReactNode> {
  await requireRouteAccess('/admin')

  const { tab = DEFAULT_TAB, sourceClassId, targetYearId } = await searchParams

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Admin Tasks"
        subtitle="Administrative tools for managing the school year."
      />

      <AdminTabBar currentTab={tab} />

      {tab === 'class-migration' && (
        <ClassMigrationTab
          sourceClassId={sourceClassId}
          targetYearId={targetYearId}
        />
      )}
      {tab === 'academic-years' && <AcademicYearsTab />}
    </div>
  )
}
