import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { canCreateStaff } from '@/lib/permissions'

import PageHeader, { RequiredFieldsNote } from '../../_components/PageHeader'

import AddStaffForm from './AddStaffForm'

export const metadata: Metadata = { title: 'Add Staff Member' }

export default async function AddStaffPage() {
  const actor = await requireSession()
  const role = actor.role

  if (!canCreateStaff(role)) {
    redirect('/staff')
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Add Staff Member"
        subtitle={RequiredFieldsNote}
        backHref="/staff"
        backLabel="Staff"
      />

      <AddStaffForm />
    </div>
  )
}
