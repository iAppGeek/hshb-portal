import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  getRegistrationSubmissions,
  getPhotoOptOuts,
  getStudentsForLinking,
  findStudentMatches,
  type StudentMatch,
} from '@/db'
import {
  canReviewRegistrations,
  canApproveRegistrations,
} from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import EmptyState from '../_components/EmptyState'
import PageHeader from '../_components/PageHeader'

import PhotoOptOutSection from './PhotoOptOutSection'
import RegistrationTabs from './RegistrationTabs'
import RegistrationsTable from './RegistrationsTable'
import ShareLinksBar from './ShareLinksBar'

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
  const isAdmin = canApproveRegistrations(role)

  const [registrations, photoOptOuts, studentsForLinking] = await Promise.all([
    getRegistrationSubmissions(
      status as 'pending' | 'actioned' | 'rejected' | 'all',
    ),
    getPhotoOptOuts('all'),
    isAdmin ? getStudentsForLinking() : Promise.resolve([]),
  ])

  const matchesByRequest: Record<string, StudentMatch[]> = {}
  if (isAdmin) {
    const pending = photoOptOuts.filter((r) => r.status === 'pending')
    const results = await Promise.all(
      pending.map((r) =>
        findStudentMatches({
          firstName: r.child_first_name,
          lastName: r.child_last_name,
          dateOfBirth: r.date_of_birth,
        }),
      ),
    )
    pending.forEach((r, i) => {
      matchesByRequest[r.id] = results[i]
    })
  }

  return (
    <>
      <PageHeader title="Registrations" />
      <ShareLinksBar />

      <PhotoOptOutSection
        requests={photoOptOuts}
        matchesByRequest={matchesByRequest}
        studentsForLinking={studentsForLinking}
        role={role}
      />

      <RegistrationTabs currentStatus={status} />

      {registrations.length === 0 ? (
        <EmptyState message="No registrations found." />
      ) : (
        <RegistrationsTable registrations={registrations} />
      )}
    </>
  )
}
