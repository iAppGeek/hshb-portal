import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getRegistrationSubmissions } from '@/db'
import { canReviewRegistrations } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import EmptyState from '../_components/EmptyState'
import PageHeader from '../_components/PageHeader'

import RegistrationTabs from './RegistrationTabs'
import RegistrationsTable from './RegistrationsTable'

export const metadata: Metadata = { title: 'Registrations' }

const DEFAULT_STATUS = 'pending'

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await auth()
  const role = session?.user?.role as StaffRole | undefined

  if (!role || !canReviewRegistrations(role)) {
    redirect('/dashboard')
  }

  const { status = DEFAULT_STATUS } = await searchParams
  const registrations = await getRegistrationSubmissions(
    status as 'pending' | 'actioned' | 'rejected' | 'all',
  )

  return (
    <>
      <PageHeader title="Registrations" />
      <RegistrationTabs currentStatus={status} />

      {registrations.length === 0 ? (
        <EmptyState message="No registrations found." />
      ) : (
        <RegistrationsTable registrations={registrations} />
      )}
    </>
  )
}
