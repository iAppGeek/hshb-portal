import { type Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireRouteAccess } from '@/auth/require'
import {
  getPhotoOptOutById,
  findStudentMatches,
  getStudentsForLinking,
  type StudentMatch,
} from '@/db'
import { logError } from '@/lib/log'
import { canApproveRegistrations } from '@/lib/permissions'

import PhotoOptOutReview from './PhotoOptOutReview'

export const metadata: Metadata = { title: 'Review Photo Opt-out' }

export default async function PhotoOptOutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactElement> {
  const { role } = await requireRouteAccess('/registrations')

  const { id } = await params
  const request = await getPhotoOptOutById(id)

  if (!request) {
    notFound()
  }

  // Only a pending request can be matched, and only by an admin.
  const canMatch = canApproveRegistrations(role) && request.status === 'pending'

  const [matches, studentsForLinking] = await Promise.all([
    canMatch
      ? findStudentMatches({
          firstName: request.child_first_name,
          lastName: request.child_last_name,
          dateOfBirth: request.date_of_birth,
        }).catch((err: unknown) => {
          logError('registrations.photoOptOut.findStudentMatches', err)
          return [] as StudentMatch[]
        })
      : Promise.resolve([]),
    canMatch ? getStudentsForLinking() : Promise.resolve([]),
  ])

  return (
    <PhotoOptOutReview
      request={request}
      role={role}
      matches={matches}
      studentsForLinking={studentsForLinking}
    />
  )
}
