'use client'

import { useState } from 'react'

import {
  FormActions,
  FormGrid,
  FormSection,
  TextField,
  formStyles,
  useServerForm,
} from '@/components/form'
import { roleDescriptions } from '@/lib/roleLabels'
import type { StaffRole } from '@/types/next-auth'

import { updateStaffAction } from './actions'

type StaffData = {
  id: string
  title: string
  first_name: string
  last_name: string
  email: string
  role: string
  display_name: string | null
  contact_number: string | null
  personal_email: string | null
}

const ROLES = [
  { value: 'teacher', label: 'Teacher' },
  { value: 'admin', label: 'Admin' },
  { value: 'headteacher', label: 'Headteacher' },
  { value: 'secretary', label: 'Secretary' },
]

export default function EditStaffForm({ staff }: { staff: StaffData }) {
  const [selectedRole, setSelectedRole] = useState<StaffRole>(
    staff.role as StaffRole,
  )
  const { handleSubmit, isPending, error, fieldError } = useServerForm((fd) =>
    updateStaffAction(staff.id, fd),
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Staff Details">
        <FormGrid>
          <TextField
            label="Title"
            name="title"
            required
            defaultValue={staff.title}
            error={fieldError('title')}
          />
          <TextField
            label="First name"
            name="first_name"
            required
            defaultValue={staff.first_name}
            autoComplete="given-name"
            error={fieldError('first_name')}
          />
          <TextField
            label="Last name"
            name="last_name"
            required
            defaultValue={staff.last_name}
            autoComplete="family-name"
            error={fieldError('last_name')}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            required
            defaultValue={staff.email}
            error={fieldError('email')}
          />
          <div>
            <label htmlFor="role" className={formStyles.label}>
              Role<span className={formStyles.requiredMark}>*</span>
            </label>
            <select
              id="role"
              name="role"
              required
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as StaffRole)}
              className={formStyles.input}
            >
              <option value="">Select a role…</option>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className={formStyles.hint}>{roleDescriptions[selectedRole]}</p>
          </div>
          <TextField
            label="Display name"
            name="display_name"
            defaultValue={staff.display_name}
            error={fieldError('display_name')}
          />
          <TextField
            label="Contact number"
            name="contact_number"
            type="tel"
            defaultValue={staff.contact_number}
            error={fieldError('contact_number')}
          />
          <TextField
            label="Personal email"
            name="personal_email"
            type="email"
            defaultValue={staff.personal_email}
            error={fieldError('personal_email')}
          />
        </FormGrid>
      </FormSection>

      <FormActions
        submitLabel="Save changes"
        isPending={isPending}
        cancelHref="/staff"
        error={error ?? undefined}
      />
    </form>
  )
}
