import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  getRegistrationSubmissionById,
  findStudentMatches,
  getStudentsForLinking,
  getAllClasses,
  type StudentMatch,
} from '@/db'
import {
  canReviewRegistrations,
  canApproveRegistrations,
} from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import RegistrationReview from './RegistrationReview'

export const metadata: Metadata = { title: 'Review Registration' }

export default async function RegistrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const role = session?.user?.role as StaffRole | undefined

  if (!role || !canReviewRegistrations(role)) {
    redirect('/dashboard')
  }

  const { id } = await params
  const submission = await getRegistrationSubmissionById(id)

  if (!submission) {
    redirect('/registrations')
  }

  const isAdmin = canApproveRegistrations(role)

  const [matches, studentsForLinking, classes] = await Promise.all([
    isAdmin
      ? findStudentMatches({
          firstName: submission.child_first_name,
          lastName: submission.child_last_name,
          dateOfBirth: submission.date_of_birth,
        }).catch((err: unknown) => {
          console.error(
            '[RegistrationDetailPage] findStudentMatches failed:',
            err,
          )
          return [] as StudentMatch[]
        })
      : Promise.resolve([]),
    isAdmin ? getStudentsForLinking() : Promise.resolve([]),
    isAdmin ? getAllClasses() : Promise.resolve([]),
  ])

  return (
    <RegistrationReview
      submission={submission}
      role={role}
      matches={matches}
      studentsForLinking={studentsForLinking}
      classes={classes}
    />
  )
}
