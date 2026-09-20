import { type ReactNode } from 'react'
import { type Metadata } from 'next'

import { requireRole } from '@/auth/require'
import { canAccessAdminTasks } from '@/lib/permissions'

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
  await requireRole(canAccessAdminTasks)

  const { tab = DEFAULT_TAB, sourceClassId, targetYearId } = await searchParams

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Tasks</h1>
        <p className="mt-1 text-sm text-gray-500">
          Administrative tools for managing the school year.
        </p>
      </div>

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
