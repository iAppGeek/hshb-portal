import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getAllGuardians } from '@/db'
import { canCreateStudents } from '@/lib/permissions'

import PageHeader, { RequiredFieldsNote } from '../../_components/PageHeader'

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
      <PageHeader
        title="Add Student"
        subtitle={RequiredFieldsNote}
        backHref="/students"
        backLabel="Students"
      />

      <AddStudentForm guardians={guardians} />
    </div>
  )
}
