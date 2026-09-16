import { type Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import StaffEmailDropdown from '@/clientComponents/StaffEmailDropdown'
import Tooltip from '@/components/Tooltip'
import { getAllStaffWithClasses } from '@/db'
import { compareNullableText } from '@/lib/grid/sort'
import { td, th } from '@/lib/grid/styles'
import { mailtoWithBcc, staffEmailsForMailto } from '@/lib/mailto'
import {
  canEditStaff,
  canCreateStaff,
  canSeeStaffContact,
  canSeeAllData,
  TEACHING_ROLES,
} from '@/lib/permissions'
import { roleLabels } from '@/lib/roleLabels'
import type { StaffRole } from '@/types/next-auth'

import EmptyState from '../_components/EmptyState'
import PageHeader from '../_components/PageHeader'

export const metadata: Metadata = { title: 'Staff' }

const TD_LINK = 'hidden px-3 py-4 text-sm sm:table-cell sm:px-6'

export default async function StaffPage() {
  const session = await auth()
  if (!session) {
    redirect('/login')
  }

  const role = session.user?.role as StaffRole
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
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="hidden bg-gray-50 sm:table-header-group">
                <tr>
                  <th className={th}>Title</th>
                  <th className={th}>First name</th>
                  <th className={th}>Last name</th>
                  <th className={th}>Display name</th>
                  <th className={th}>Role</th>
                  <th className={th}>Email</th>
                  {canSeeContact && <th className={th}>Contact</th>}
                  {canSeeContact && <th className={th}>Personal Email</th>}
                  <th className={th}>Class</th>
                  <th className={th}>Room</th>
                  {(canEdit || canSeeAllData(role)) && (
                    <th className={th}>Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {staff.map((member) => {
                  const classes =
                    (member.classes as
                      | {
                          id: string
                          name: string
                          room_number: string | null
                        }[]
                      | null) ?? []
                  const classesText =
                    classes.length > 0
                      ? classes.map((c) => c.name).join(', ')
                      : '—'
                  const roomText =
                    classes.length > 0
                      ? classes.map((c) => c.room_number ?? '—').join(', ')
                      : '—'

                  return (
                    <tr
                      key={member.id}
                      className="block border-b border-gray-200 last:border-0 hover:bg-gray-50 sm:table-row sm:border-0"
                    >
                      <td className={td}>{member.title}</td>

                      {/* Full name — on mobile: name left, Edit link right */}
                      <td className="block px-4 pt-4 pb-0 text-sm font-medium text-gray-900 sm:table-cell sm:px-6 sm:py-4 sm:whitespace-nowrap">
                        <div className="flex items-center justify-between gap-2 sm:block">
                          <span>
                            <span className="sm:hidden">{member.title} </span>
                            {member.first_name}
                            <span className="sm:hidden">
                              {' '}
                              {member.last_name}
                            </span>
                          </span>
                          {canEdit ? (
                            <Link
                              href={`/staff/${member.id}/edit`}
                              className="shrink-0 text-sm text-blue-600 hover:text-blue-800 sm:hidden"
                            >
                              Edit
                            </Link>
                          ) : (
                            canSeeAllData(role) && (
                              <Tooltip text="You don't have permission to edit staff">
                                <span className="shrink-0 cursor-not-allowed text-sm text-gray-400 sm:hidden">
                                  Edit
                                </span>
                              </Tooltip>
                            )
                          )}
                        </div>
                      </td>

                      {/* Mobile secondary: all other fields */}
                      <td className="block px-4 py-2 text-xs text-gray-500 sm:hidden">
                        <div className="space-y-0.5">
                          <span className="block">
                            {member.display_name ?? '—'}
                            {' · '}
                            {roleLabels[member.role as StaffRole] ??
                              member.role}
                          </span>
                          <span className="block">
                            <a
                              href={`mailto:${member.email}`}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              {member.email}
                            </a>
                          </span>
                          <span className="block">
                            {classesText}
                            {' · '}
                            {roomText}
                          </span>
                          {canSeeContact && (
                            <span className="block">
                              {member.contact_number ? (
                                <a
                                  href={`tel:${member.contact_number}`}
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  {member.contact_number}
                                </a>
                              ) : (
                                '—'
                              )}
                            </span>
                          )}
                          {canSeeContact && (
                            <span className="block">
                              {member.personal_email ? (
                                <a
                                  href={`mailto:${member.personal_email}`}
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  {member.personal_email}
                                </a>
                              ) : (
                                '—'
                              )}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Desktop-only columns */}
                      <td className="hidden px-3 py-4 text-sm font-medium text-gray-900 sm:table-cell sm:px-6">
                        {member.last_name}
                      </td>
                      <td className={td}>{member.display_name ?? '—'}</td>
                      <td className={td}>
                        {roleLabels[member.role as StaffRole] ?? member.role}
                      </td>
                      <td className={TD_LINK}>
                        <a
                          href={`mailto:${member.email}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {member.email}
                        </a>
                      </td>
                      {canSeeContact && (
                        <td className={TD_LINK}>
                          {member.contact_number ? (
                            <a
                              href={`tel:${member.contact_number}`}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              {member.contact_number}
                            </a>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                      )}
                      {canSeeContact && (
                        <td className={TD_LINK}>
                          {member.personal_email ? (
                            <a
                              href={`mailto:${member.personal_email}`}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              {member.personal_email}
                            </a>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                      )}
                      <td className={td}>{classesText}</td>
                      <td className={td}>{roomText}</td>
                      {canEdit ? (
                        <td className="hidden px-3 py-4 text-sm sm:table-cell sm:px-6">
                          <Link
                            href={`/staff/${member.id}/edit`}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Edit
                          </Link>
                        </td>
                      ) : (
                        canSeeAllData(role) && (
                          <td className="hidden px-3 py-4 text-sm sm:table-cell sm:px-6">
                            <Tooltip text="You don't have permission to edit staff">
                              <span className="cursor-not-allowed text-gray-400">
                                Edit
                              </span>
                            </Tooltip>
                          </td>
                        )
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
