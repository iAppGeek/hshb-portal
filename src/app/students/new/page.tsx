import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getAllGuardians } from '@/db'
import { canCreateStudents } from '@/lib/permissions'

import AddStudentForm from './AddStudentForm'

export const metadata: Metadata = { title: 'Add Student' }

export default async function AddStudentPage() {
  const actor = await requireSession()
  const role = actor.role

  if (!canCreateStudents(role)) {
    redirect('/students')
  }

  const guardians = await getAllGuardians()

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add Student</h1>
        <p className="mt-1 text-sm text-gray-500">
          Fields marked with <span className="text-red-500">*</span> are
          required.
        </p>
      </div>

      <AddStudentForm guardians={guardians} />
    </div>
  )
}
