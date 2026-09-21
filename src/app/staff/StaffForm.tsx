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
import type { ActionResult } from '@/lib/action'
import { roleDescriptions, roleLabels } from '@/lib/roleLabels'
import type { StaffRole } from '@/types/next-auth'

export type StaffRow = {
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

const ROLES = Object.entries(roleLabels).map(([value, label]) => ({
  value,
  label,
}))

type Props = {
  initial?: StaffRow
  action: (formData: FormData) => Promise<ActionResult>
  submitLabel: string
}

export default function StaffForm({
  initial,
  action,
  submitLabel,
}: Props): React.ReactElement {
  const [selectedRole, setSelectedRole] = useState<StaffRole | ''>(
    (initial?.role as StaffRole | undefined) ?? '',
  )
  const { handleSubmit, isPending, error, fieldError } = useServerForm(action)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Staff Details">
        <FormGrid>
          <TextField
            label="Title"
            name="title"
            required
            defaultValue={initial?.title ?? 'Ms'}
            error={fieldError('title')}
          />
          <TextField
            label="First name"
            name="first_name"
            required
            defaultValue={initial?.first_name}
            autoComplete="given-name"
            error={fieldError('first_name')}
          />
          <TextField
            label="Last name"
            name="last_name"
            required
            defaultValue={initial?.last_name}
            autoComplete="family-name"
            error={fieldError('last_name')}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            required
            defaultValue={initial?.email}
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
            defaultValue={initial?.display_name}
            error={fieldError('display_name')}
          />
          <TextField
            label="Contact number"
            name="contact_number"
            type="tel"
            defaultValue={initial?.contact_number}
            error={fieldError('contact_number')}
          />
          <TextField
            label="Personal email"
            name="personal_email"
            type="email"
            defaultValue={initial?.personal_email}
            error={fieldError('personal_email')}
          />
        </FormGrid>
      </FormSection>

      <FormActions
        submitLabel={submitLabel}
        isPending={isPending}
        cancelHref="/staff"
        error={error ?? undefined}
      />
    </form>
  )
}
