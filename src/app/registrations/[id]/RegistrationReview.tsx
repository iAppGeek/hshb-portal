'use client'

import type { RegistrationFull, ContactRole, StudentMatch } from '@/db'
import type { GuardianMatch } from '@/db'
import DefinitionList from '@/components/DefinitionList'
import PermissionedButton from '@/components/PermissionedButton'
import { ConfirmDialog, ReasonDialog, useDialog } from '@/components/dialogs'
import { formatDateInSchoolTz, formatDateTimeInSchoolTz } from '@/lib/datetime'
import { personName } from '@/lib/format'
import { guardianReuseDiff, type FieldDiff } from '@/lib/guardianDiff'
import { canApproveRegistrations } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import PageHeader from '../../_components/PageHeader'
import { deleteRegistrationAction, rejectRegistrationAction } from '../actions'
import { workflowItems } from '../workflowItems'

import RegistrationApproveDialog from './RegistrationApproveDialog'

type ClassOption = { id: string; name: string; year_group: string }

type Props = {
  submission: RegistrationFull
  role: StaffRole
  matches: StudentMatch[]
  studentsForLinking: StudentMatch[]
  classes: ClassOption[]
  guardianMatchesByContact: Record<string, GuardianMatch[]>
}

const ADMIN_ONLY = 'Only admins can approve registrations'

const CONTACT_LABELS: Record<ContactRole, string> = {
  primary: 'Primary parent/carer',
  secondary: 'Secondary parent/carer',
  additional_1: 'Emergency contact 1',
  additional_2: 'Emergency contact 2',
}

const CONTACT_ORDER: ContactRole[] = [
  'primary',
  'secondary',
  'additional_1',
  'additional_2',
]

const GUARDIAN_FIELD_LABELS: Record<string, string> = {
  phone: 'Phone',
  email: 'Email',
  occupation: 'Occupation',
  address_line_1: 'Address line 1',
  address_line_2: 'Address line 2',
  city: 'City',
  postcode: 'Postcode',
}

export default function RegistrationReview({
  submission,
  role,
  matches,
  studentsForLinking,
  classes,
  guardianMatchesByContact,
}: Props) {
  const approveDialog = useDialog()
  const rejectDialog = useDialog()
  const deleteDialog = useDialog()

  const isAdmin = canApproveRegistrations(role)
  const canAct = isAdmin && submission.status === 'pending'

  const contactsByRole = new Map(
    submission.contacts.map((c) => [c.contact_role, c]),
  )

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={personName(
          {
            first_name: submission.child_first_name,
            last_name: submission.child_last_name,
          },
          'lastFirst',
        )}
        subtitle={`Submitted ${formatDateTimeInSchoolTz(submission.submitted_at)}`}
        backHref="/registrations"
        backLabel="Registrations"
      />

      <DefinitionList
        title="Child"
        items={[
          { label: 'First name', value: submission.child_first_name },
          { label: 'Last name', value: submission.child_last_name },
          {
            label: 'Date of birth',
            value: formatDateInSchoolTz(submission.date_of_birth),
          },
          {
            label: 'Year group preference',
            value: submission.preferred_year_group ?? '—',
          },
          {
            label: 'English (mainstream) school',
            value: submission.english_school_name ?? '—',
          },
        ]}
      />

      <DefinitionList
        title="Home address"
        items={[
          { label: 'Address line 1', value: submission.address_line_1 },
          { label: 'Address line 2', value: submission.address_line_2 ?? '—' },
          { label: 'City', value: submission.city },
          { label: 'Postcode', value: submission.postcode },
        ]}
      />

      <DefinitionList
        title="Medical"
        items={[
          { label: 'Allergies', value: submission.allergies ?? '—' },
          {
            label: 'Medical details',
            value: submission.medical_details ?? '—',
          },
        ]}
      />

      {CONTACT_ORDER.map((contactRole) => {
        const contact = contactsByRole.get(contactRole)
        if (!contact) return null
        const guardianMatches = guardianMatchesByContact[contact.id] ?? []
        return (
          <div
            key={contactRole}
            className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
          >
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              {CONTACT_LABELS[contactRole]}
            </h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ContactField
                label="Name"
                value={`${contact.first_name} ${contact.last_name}`}
              />
              <ContactField
                label="Relationship"
                value={contact.relationship ?? '—'}
              />
              <ContactField label="Phone" value={contact.phone} />
              <ContactField label="Email" value={contact.email ?? '—'} />
              <ContactField
                label="Occupation"
                value={contact.occupation ?? '—'}
              />
              <ContactField
                label="Address"
                value={
                  contact.same_as_child_address
                    ? 'Same as child'
                    : [
                        contact.address_line_1,
                        contact.address_line_2,
                        contact.city,
                        contact.postcode,
                      ]
                        .filter(Boolean)
                        .join(', ') || '—'
                }
              />
              {guardianMatches.map((m) => {
                const diff = guardianReuseDiff(m, contact, submission)
                return (
                  <div
                    key={m.id}
                    className="col-span-full rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
                  >
                    Matches existing guardian <strong>{personName(m)}</strong> (
                    {m.phone}
                    {m.email ? `, ${m.email}` : ''}) by {m.matched_on}.
                    Approving with &quot;reuse&quot; on will link the student to
                    that record and update its phone, occupation and address.
                    {diff.length === 0 ? (
                      <p className="mt-2 text-xs text-amber-700">
                        No contact details will change.
                      </p>
                    ) : (
                      <dl className="mt-2 space-y-1 text-xs">
                        {diff.map((d: FieldDiff) => (
                          <div key={d.field} className="flex gap-1">
                            <dt className="font-medium">
                              {GUARDIAN_FIELD_LABELS[d.field]}:
                            </dt>
                            <dd>
                              {d.old ?? '(empty)'} → {d.new ?? '(empty)'}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )
              })}
            </dl>
          </div>
        )
      })}

      {(submission.collect_authorised || submission.collect_password) && (
        <DefinitionList
          title="Collection arrangements"
          items={[
            {
              label: 'Who is authorised to collect',
              value: submission.collect_authorised ?? '—',
            },
            {
              label: 'Collection password',
              value: submission.collect_password ?? '—',
            },
          ]}
        />
      )}

      <DefinitionList
        title="Consents"
        items={[
          {
            label: 'Privacy notice',
            value: submission.consent_privacy_notice ? 'Yes' : 'No',
          },
          {
            label: 'Emergency first aid',
            value: submission.consent_emergency_first_aid ? 'Yes' : 'No',
          },
          {
            label: 'Photo & media',
            value: submission.consent_photo_media ? 'Yes' : 'No',
          },
          {
            label: 'Home–school agreement',
            value: submission.consent_home_school ? 'Yes' : 'No',
          },
          {
            label: 'Email & SMS',
            value: submission.consent_comms_email_sms ? 'Yes' : 'No',
          },
          { label: 'Signed by', value: submission.declaration_name },
        ]}
      />

      <p className="text-xs text-gray-400">
        Spotted a typo? Approve, then correct it on the student or guardian edit
        page.
      </p>

      <DefinitionList title="Workflow" items={workflowItems(submission)} />

      {isAdmin && submission.status === 'pending' && (
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            Possible existing students
          </h2>
          {matches.length === 0 ? (
            <p className="text-sm text-gray-500">No existing students match.</p>
          ) : (
            <ul className="space-y-1 text-sm text-gray-700">
              {matches.map((m) => (
                <li key={m.id}>
                  {personName(m, 'lastFirst')}
                  {m.date_of_birth ? ` — ${m.date_of_birth}` : ''}
                  {m.student_code ? ` (${m.student_code})` : ''}
                  {!m.active && (
                    <span className="ml-1 text-xs text-gray-400">
                      (inactive)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <PermissionedButton
          allowed={canAct}
          showDisabled={!isAdmin}
          disabledReason={ADMIN_ONLY}
          onClick={() => approveDialog.open()}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          Approve & save student
        </PermissionedButton>
        <PermissionedButton
          allowed={canAct}
          showDisabled={!isAdmin}
          disabledReason={ADMIN_ONLY}
          onClick={() => rejectDialog.open()}
          className="bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
        >
          Reject
        </PermissionedButton>
        <PermissionedButton
          allowed={isAdmin}
          showDisabled={!isAdmin}
          disabledReason={ADMIN_ONLY}
          onClick={() => deleteDialog.open()}
          className="bg-white text-red-600 ring-1 ring-gray-300 hover:bg-red-50"
        >
          Delete
        </PermissionedButton>
      </div>

      {deleteDialog.isOpen && (
        <ConfirmDialog
          title="Delete registration"
          body={
            submission.status === 'actioned'
              ? 'Delete this registration record permanently? The student and guardian records created from it are not affected. This cannot be undone.'
              : 'Delete this registration permanently? This cannot be undone.'
          }
          confirmLabel="Confirm delete"
          pendingLabel="Deleting…"
          variant="danger"
          onConfirm={() => deleteRegistrationAction(submission.id)}
          onClose={deleteDialog.close}
        />
      )}

      {approveDialog.isOpen && (
        <RegistrationApproveDialog
          submissionId={submission.id}
          matches={matches}
          studentsForLinking={studentsForLinking}
          classes={classes}
          hasGuardianMatches={Object.values(guardianMatchesByContact).some(
            (m) => m.length > 0,
          )}
          onClose={approveDialog.close}
        />
      )}

      {rejectDialog.isOpen && (
        <ReasonDialog
          title="Reject registration"
          confirmLabel="Reject"
          pendingLabel="Rejecting…"
          onConfirm={(reason) =>
            rejectRegistrationAction(submission.id, reason)
          }
          onClose={rejectDialog.close}
        />
      )}
    </div>
  )
}

/**
 * Not `DefinitionList`: this contact block interleaves guardian-match warning
 * cards after the field pairs, which `DefinitionList`'s items-only API
 * doesn't support.
 */
function ContactField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value}</dd>
    </div>
  )
}
