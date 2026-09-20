import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { canCreateStaff } from '@/lib/permissions'

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add Staff Member</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fields marked with <span className="text-red-500">*</span> are
          required.
        </p>
      </div>

      <AddStaffForm />
    </div>
  )
}
