'use client'

import Link from 'next/link'

import type { GuardianFull, GuardianStudentLink } from '@/db'
import {
  FormActions,
  FormGrid,
  FormSection,
  TextField,
  useServerForm,
} from '@/components/form'

import { updateGuardianAction } from './actions'

type Props = {
  guardian: GuardianFull
  linkedStudents: GuardianStudentLink[]
}

export default function EditGuardianForm({ guardian, linkedStudents }: Props) {
  const { handleSubmit, isPending, error, fieldError } = useServerForm((fd) =>
    updateGuardianAction(guardian.id, fd),
  )

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit}>
        <FormSection title="Guardian Details">
          <FormGrid>
            <TextField
              label="First name"
              name="first_name"
              required
              defaultValue={guardian.first_name}
              autoComplete="given-name"
              error={fieldError('first_name')}
            />
            <TextField
              label="Last name"
              name="last_name"
              required
              defaultValue={guardian.last_name}
              autoComplete="family-name"
              error={fieldError('last_name')}
            />
            <TextField
              label="Phone"
              name="phone"
              type="tel"
              required
              defaultValue={guardian.phone}
              error={fieldError('phone')}
            />
            <TextField
              label="Email"
              name="email"
              type="email"
              defaultValue={guardian.email}
              error={fieldError('email')}
            />
            <TextField
              label="Occupation"
              name="occupation"
              defaultValue={guardian.occupation}
              error={fieldError('occupation')}
            />
          </FormGrid>

          <div className="mt-4">
            <FormGrid>
              <TextField
                label="Address line 1"
                name="address_line_1"
                defaultValue={guardian.address_line_1}
                autoComplete="address-line1"
                error={fieldError('address_line_1')}
              />
              <TextField
                label="Address line 2"
                name="address_line_2"
                defaultValue={guardian.address_line_2}
                autoComplete="address-line2"
                error={fieldError('address_line_2')}
              />
              <TextField
                label="City"
                name="city"
                defaultValue={guardian.city}
                autoComplete="address-level2"
                error={fieldError('city')}
              />
              <TextField
                label="Postcode"
                name="postcode"
                defaultValue={guardian.postcode}
                autoComplete="postal-code"
                error={fieldError('postcode')}
              />
            </FormGrid>
          </div>

          <div className="mt-4">
            <TextField
              label="Notes"
              name="notes"
              defaultValue={guardian.notes}
              error={fieldError('notes')}
            />
          </div>
        </FormSection>

        <div className="mt-6">
          <FormActions
            submitLabel="Save changes"
            isPending={isPending}
            cancelHref="/students"
            cancelLabel="Back to students"
            error={error ?? undefined}
          />
        </div>
      </form>

      {/* ── Linked Students ──────────────────────────────────────────── */}
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">
          Linked Students
        </h2>
        {linkedStudents.length === 0 ? (
          <p className="text-sm text-gray-400">No students linked.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {linkedStudents.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-900">
                  {s.last_name}, {s.first_name}
                  {s.student_code && (
                    <span className="ml-2 text-gray-400">
                      ({s.student_code})
                    </span>
                  )}
                </span>
                <Link
                  href={`/students/${s.id}/edit`}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
