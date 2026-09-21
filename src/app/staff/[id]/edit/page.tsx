import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getStaffById } from '@/db'
import { canEditStaff } from '@/lib/permissions'

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
    redirect('/staff')
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Edit Staff: {staff.last_name}, {staff.first_name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Fields marked with <span className="text-red-500">*</span> are
          required.
        </p>
      </div>

      <EditStaffForm staff={staff} />
    </div>
  )
}
