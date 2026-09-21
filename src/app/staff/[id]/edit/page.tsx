import { type Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getStaffById } from '@/db'
import { canEditStaff } from '@/lib/permissions'

import PageHeader, { RequiredFieldsNote } from '../../../_components/PageHeader'

import EditStaffForm from './EditStaffForm'

export const metadata: Metadata = { title: 'Edit Staff Member' }

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const actor = await requireSession()
  const role = actor.role

  if (!canEditStaff(role)) {
    redirect('/staff')
  }

  const { id } = await params
  const staff = await getStaffById(id)

  if (!staff) {
    notFound()
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`Edit Staff: ${staff.last_name}, ${staff.first_name}`}
        subtitle={RequiredFieldsNote}
        backHref="/staff"
        backLabel="Staff"
      />

      <EditStaffForm staff={staff} />
    </div>
  )
}
