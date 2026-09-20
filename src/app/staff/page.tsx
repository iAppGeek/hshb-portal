import { type Metadata } from 'next'
import Link from 'next/link'

import { requireSession } from '@/auth/require'
import StaffEmailDropdown from '@/clientComponents/StaffEmailDropdown'
import Tooltip from '@/components/Tooltip'
import { getAllStaffWithClasses } from '@/db'
import { compareNullableText } from '@/lib/grid/sort'
import { mailtoWithBcc, staffEmailsForMailto } from '@/lib/mailto'
import {
  canEditStaff,
  canCreateStaff,
  canSeeStaffContact,
  canSeeAllData,
  TEACHING_ROLES,
} from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import EmptyState from '../_components/EmptyState'
import PageHeader from '../_components/PageHeader'

import StaffTable from './StaffTable'

export const metadata: Metadata = { title: 'Staff' }

export default async function StaffPage() {
  const actor = await requireSession()

  const role = actor.role
  const canEdit = canEditStaff(role)
  const canCreate = canCreateStaff(role)
  const canSeeContact = canSeeStaffContact(role)

  const staffRaw = await getAllStaffWithClasses()

  const firstClassName = (member: (typeof staffRaw)[number]): string | null =>
    (member.classes as { name: string }[] | null)?.[0]?.name.toLowerCase() ||
    null

  const staff = [...staffRaw].sort((a, b) =>
    compareNullableText(firstClassName(a), firstClassName(b)),
  )

  const teachingMembers = staff.filter((m) =>
    TEACHING_ROLES.includes(m.role as StaffRole),
  )
  const teacherBccEmails = staffEmailsForMailto(teachingMembers, canSeeContact)
  const allStaffBccEmails = staffEmailsForMailto(staff, canSeeContact)
  const teacherMailtoHref = mailtoWithBcc(teacherBccEmails, {
    subject: 'Teachers & headteachers',
  })
  const allStaffMailtoHref = mailtoWithBcc(allStaffBccEmails, {
    subject: 'Staff',
  })

  return (
    <>
      <PageHeader
        title="Staff"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {staff.length > 0 && (
              <StaffEmailDropdown
                teachers={{
                  emails: teacherBccEmails,
                  mailtoHref: teacherMailtoHref,
                }}
                allStaff={{
                  emails: allStaffBccEmails,
                  mailtoHref: allStaffMailtoHref,
                }}
                triggerClassName="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 shadow-sm transition hover:bg-blue-50"
                emptyReason="No email addresses available for staff on this list."
                mailtoUnavailableReason="Too many addresses for your email app. Use copy instead."
              />
            )}
            {canCreate ? (
              <Link
                href="/staff/new"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
              >
                Add Staff
              </Link>
            ) : canSeeAllData(role) ? (
              <Tooltip text="You don't have permission to add staff">
                <span className="cursor-not-allowed rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-50 shadow-sm">
                  Add Staff
                </span>
              </Tooltip>
            ) : null}
          </div>
        }
      />

      {staff.length === 0 ? (
        <EmptyState message="No staff found." />
      ) : (
        <StaffTable
          staff={staff}
          canEdit={canEdit}
          canSeeContact={canSeeContact}
          role={role}
        />
      )}
    </>
  )
}
