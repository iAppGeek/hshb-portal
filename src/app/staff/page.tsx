import { type Metadata } from 'next'

import { requireSession } from '@/auth/require'
import EmailDropdown from '@/clientComponents/EmailDropdown'
import PermissionedLink from '@/components/PermissionedLink'
import { getAllStaffWithClasses } from '@/db'
import { compareClasses, sortClasses, type SortableClass } from '@/lib/classes'
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

  const firstClass = (
    member: (typeof staffRaw)[number],
  ): SortableClass | null => sortClasses(member.classes)[0] ?? null

  const staff = [...staffRaw].sort((a, b) =>
    compareClasses(firstClass(a), firstClass(b)),
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
              <EmailDropdown
                groups={[
                  {
                    label: 'Teachers & headteachers',
                    emails: teacherBccEmails,
                    mailtoHref: teacherMailtoHref,
                    noEmailsReason:
                      'No teacher or headteacher emails on this list.',
                  },
                  {
                    label: 'All staff',
                    emails: allStaffBccEmails,
                    mailtoHref: allStaffMailtoHref,
                    noEmailsReason: 'No staff emails on this list.',
                  },
                ]}
                buttonLabel="Email staff"
                triggerClassName="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 shadow-sm transition hover:bg-blue-50"
                emptyReason="No email addresses available for staff on this list."
                mailtoUnavailableReason="Too many addresses for your email app. Use copy instead."
              />
            )}
            <PermissionedLink
              href="/staff/new"
              allowed={canCreate}
              showDisabled={canSeeAllData(role)}
              disabledReason="You don't have permission to add staff"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
            >
              Add Staff
            </PermissionedLink>
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
