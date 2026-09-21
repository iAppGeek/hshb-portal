'use client'

import { useState } from 'react'

import {
  FormActions,
  FormGrid,
  FormSection,
  SelectField,
  TextField,
  useServerForm,
} from '@/components/form'
import { roleDescriptions } from '@/lib/roleLabels'
import type { StaffRole } from '@/types/next-auth'

import { createStaffAction } from './actions'

const ROLES = [
  { value: 'teacher', label: 'Teacher' },
  { value: 'admin', label: 'Admin' },
  { value: 'headteacher', label: 'Headteacher' },
  { value: 'secretary', label: 'Secretary' },
]

export default function AddStaffForm() {
  const [selectedRole, setSelectedRole] = useState<StaffRole | ''>('')
  const { handleSubmit, isPending, error, fieldError } =
    useServerForm(createStaffAction)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Staff Details">
        <FormGrid>
          <TextField
            label="Title"
            name="title"
            required
            defaultValue="Ms"
            error={fieldError('title')}
          />
          <TextField
            label="First name"
            name="first_name"
            required
            autoComplete="given-name"
            error={fieldError('first_name')}
          />
          <TextField
            label="Last name"
            name="last_name"
            required
            autoComplete="family-name"
            error={fieldError('last_name')}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            required
            error={fieldError('email')}
          />
          <SelectField
            label="Role"
            name="role"
            required
            value={selectedRole}
            onChange={(v) => setSelectedRole(v as StaffRole | '')}
            placeholder="Select a role…"
            options={ROLES}
            hint={selectedRole ? roleDescriptions[selectedRole] : undefined}
            error={fieldError('role')}
          />
          <TextField
            label="Display name"
            name="display_name"
            error={fieldError('display_name')}
          />
          <TextField
            label="Contact number"
            name="contact_number"
            type="tel"
            error={fieldError('contact_number')}
          />
          <TextField
            label="Personal email"
            name="personal_email"
            type="email"
            error={fieldError('personal_email')}
          />
        </FormGrid>
      </FormSection>

      <FormActions
        submitLabel="Add Staff Member"
        isPending={isPending}
        cancelHref="/staff"
        error={error ?? undefined}
      />
    </form>
  )
}
