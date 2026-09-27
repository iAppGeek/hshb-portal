import { type ReactNode } from 'react'
import { type Metadata } from 'next'

import { requireRouteAccess } from '@/auth/require'
import TabBar, { type Tab } from '@/components/TabBar'

import PageHeader from '../_components/PageHeader'

import AcademicYearsTab from './_tabs/academic-years/AcademicYearsTab'
import ClassMigrationTab from './_tabs/class-migration/ClassMigrationTab'
import CommunicationTab from './_tabs/communication/CommunicationTab'

export const metadata: Metadata = { title: 'Admin Tasks' }

const DEFAULT_TAB = 'class-migration'

const TABS: Tab[] = [
  {
    key: 'class-migration',
    label: 'Class Migration',
    href: '/admin?tab=class-migration',
  },
  {
    key: 'academic-years',
    label: 'Academic Years',
    href: '/admin?tab=academic-years',
  },
  {
    key: 'communication',
    label: 'Communication',
    href: '/admin?tab=communication',
  },
]

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
    <div className={tab === 'communication' ? 'max-w-3xl' : 'max-w-2xl'}>
      <PageHeader
        title="Admin Tasks"
        subtitle="Administrative tools for managing the school year."
      />

      <TabBar tabs={TABS} current={tab} ariaLabel="Admin tasks" />

      {tab === 'class-migration' && (
        <ClassMigrationTab
          sourceClassId={sourceClassId}
          targetYearId={targetYearId}
        />
      )}
      {tab === 'academic-years' && <AcademicYearsTab />}
      {tab === 'communication' && <CommunicationTab />}
    </div>
  )
}
