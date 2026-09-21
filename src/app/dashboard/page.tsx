import { Suspense } from 'react'
import { type Metadata } from 'next'

import { requireSession } from '@/auth/require'
import { todayInSchoolTz } from '@/lib/datetime'
import { roleLabels } from '@/lib/roleLabels'

import PageHeader from '../_components/PageHeader'

import DashboardStats, { StatCardsSkeleton } from './DashboardStats'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const actor = await requireSession()
  const role = actor.role
  const today = todayInSchoolTz()

  return (
    <>
      <PageHeader
        title={`Welcome back, ${actor.name?.split(' ')[0]}`}
        subtitle={roleLabels[role]}
      />

      <Suspense fallback={<StatCardsSkeleton />}>
        <DashboardStats role={role} staffId={actor.staffId} today={today} />
      </Suspense>
    </>
  )
}
