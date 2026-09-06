'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'

import type { RegistrationFull, ContactRole, StudentMatch } from '@/db'
import Tooltip from '@/components/Tooltip'
import { formatDateInSchoolTz, formatDateTimeInSchoolTz } from '@/lib/datetime'
import { canApproveRegistrations } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import { deleteRegistrationAction } from '../actions'

import ApproveDialog from './ApproveDialog'
import RejectDialog from './RejectDialog'

type ClassOption = { id: string; name: string; year_group: string }

type Props = {
  submission: RegistrationFull
  role: StaffRole
  matches: StudentMatch[]
  studentsForLinking: StudentMatch[]
  classes: ClassOption[]
}

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

export default function RegistrationReview({
  submission,
  role,
  matches,
  studentsForLinking,
  classes,
}: Props) {
  const [showApprove, setShowApprove] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isAdmin = canApproveRegistrations(role)
  const canAct = isAdmin && submission.status === 'pending'
  const canDelete = isAdmin && submission.status !== 'actioned'

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await deleteRegistrationAction(submission.id)
      if (result?.error) setError(result.error)
    })
  }

  const contactsByRole = new Map(
    submission.contacts.map((c) => [c.contact_role, c]),
  )

  return (
    <div className="max-w-3xl space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">
          {submission.child_last_name}, {submission.child_first_name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Submitted {formatDateTimeInSchoolTz(submission.submitted_at)}
        </p>
      </div>

      <Section title="Child">
        <Field label="First name" value={submission.child_first_name} />
        <Field label="Last name" value={submission.child_last_name} />
        <Field
          label="Date of birth"
          value={formatDateInSchoolTz(submission.date_of_birth)}
        />
        <Field
          label="Year group preference"
          value={submission.preferred_year_group ?? '—'}
        />
      </Section>

      <Section title="Home address">
        <Field label="Address line 1" value={submission.address_line_1} />
        <Field
          label="Address line 2"
          value={submission.address_line_2 ?? '—'}
        />
        <Field label="City" value={submission.city} />
        <Field label="Postcode" value={submission.postcode} />
      </Section>

      <Section title="Medical">
        <Field label="Allergies" value={submission.allergies ?? '—'} />
        <Field
          label="Medical details"
          value={submission.medical_details ?? '—'}
        />
      </Section>

      {CONTACT_ORDER.map((contactRole) => {
        const contact = contactsByRole.get(contactRole)
        if (!contact) return null
        return (
          <Section key={contactRole} title={CONTACT_LABELS[contactRole]}>
            <Field
              label="Name"
              value={`${contact.first_name} ${contact.last_name}`}
            />
            <Field label="Relationship" value={contact.relationship ?? '—'} />
            <Field label="Phone" value={contact.phone} />
            <Field label="Email" value={contact.email ?? '—'} />
            <Field
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
          </Section>
        )
      })}

      {(submission.collect_authorised || submission.collect_password) && (
        <Section title="Collection arrangements">
          <Field
            label="Who is authorised to collect"
            value={submission.collect_authorised ?? '—'}
          />
          <Field
            label="Collection password"
            value={submission.collect_password ?? '—'}
          />
        </Section>
      )}

      <Section title="Consents">
        <ConsentField
          label="Privacy notice"
          value={submission.consent_privacy_notice}
        />
        <ConsentField
          label="Emergency first aid"
          value={submission.consent_emergency_first_aid}
        />
        <ConsentField
          label="Photo & media"
          value={submission.consent_photo_media}
        />
        <ConsentField
          label="Home–school agreement"
          value={submission.consent_home_school}
        />
        <ConsentField
          label="Email & SMS"
          value={submission.consent_comms_email_sms}
        />
        <Field label="Signed by" value={submission.declaration_name} />
      </Section>

      <p className="text-xs text-gray-400">
        Spotted a typo? Approve, then correct it on the student or guardian edit
        page.
      </p>

      <Section title="Workflow">
        <Field
          label="Submitted"
          value={formatDateTimeInSchoolTz(submission.submitted_at)}
        />
        <Field label="Status" value={submission.status} />
        {submission.actioned_at && (
          <Field
            label="Actioned"
            value={formatDateTimeInSchoolTz(submission.actioned_at)}
          />
        )}
        {submission.student_id && (
          <div>
            <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">
              Student
            </dt>
            <dd className="mt-0.5 text-sm text-gray-900">
              <Link
                href={`/students/${submission.student_id}/edit`}
                className="text-blue-600 hover:text-blue-800"
              >
                View student
              </Link>
            </dd>
          </div>
        )}
        {submission.rejected_reason && (
          <Field label="Rejected reason" value={submission.rejected_reason} />
        )}
      </Section>

      {isAdmin && submission.status === 'pending' && (
        <Section title="Possible existing students">
          {matches.length === 0 ? (
            <p className="text-sm text-gray-500">No existing students match.</p>
          ) : (
            <ul className="space-y-1 text-sm text-gray-700">
              {matches.map((m) => (
                <li key={m.id}>
                  {m.last_name}, {m.first_name}
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
        </Section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <ActionButton
          label="Approve & save student"
          canAct={canAct}
          role={role}
          onClick={() => setShowApprove(true)}
          className="bg-blue-600 text-white hover:bg-blue-700"
        />
        <ActionButton
          label="Reject"
          canAct={canAct}
          role={role}
          onClick={() => setShowReject(true)}
          className="bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
        />
        <ActionButton
          label="Delete"
          canAct={canDelete}
          role={role}
          onClick={() => setConfirmDelete(true)}
          className="bg-white text-red-600 ring-1 ring-gray-300 hover:bg-red-50"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {confirmDelete && (
        <div className="rounded-lg bg-red-50 p-4">
          <p className="mb-3 text-sm text-red-800">
            Delete this registration permanently? This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={handleDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showApprove && (
        <ApproveDialog
          submissionId={submission.id}
          matches={matches}
          studentsForLinking={studentsForLinking}
          classes={classes}
          onClose={() => setShowApprove(false)}
        />
      )}

      {showReject && (
        <RejectDialog
          submissionId={submission.id}
          onClose={() => setShowReject(false)}
        />
      )}
    </div>
  )
}

function ActionButton({
  label,
  canAct,
  role,
  onClick,
  className,
}: {
  label: string
  canAct: boolean
  role: StaffRole
  onClick: () => void
  className: string
}) {
  if (canAct) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition ${className}`}
      >
        {label}
      </button>
    )
  }

  if (!canApproveRegistrations(role)) {
    return (
      <Tooltip text="Only admins can approve registrations">
        <span className="cursor-not-allowed rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-400">
          {label}
        </span>
      </Tooltip>
    )
  }

  return null
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</dl>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value}</dd>
    </div>
  )
}

function ConsentField({ label, value }: { label: string; value: boolean }) {
  return <Field label={label} value={value ? 'Yes' : 'No'} />
}
