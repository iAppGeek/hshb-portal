import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getAllGuardians, getNextStudentCode } from '@/db'
import { canCreateStudents } from '@/lib/permissions'

import PageHeader, { RequiredFieldsNote } from '../../_components/PageHeader'
import { saveStudentAction } from '../actions'
import StudentForm from '../StudentForm'

export const metadata: Metadata = { title: 'Add Student' }

export default async function AddStudentPage() {
  const actor = await requireSession()
  const role = actor.role

  if (!canCreateStudents(role)) {
    redirect('/students')
  }

  const [guardians, suggestedCode] = await Promise.all([
    getAllGuardians(),
    getNextStudentCode(),
  ])

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Add Student"
        subtitle={RequiredFieldsNote}
        backHref="/students"
        backLabel="Students"
      />

      <StudentForm
        guardians={guardians}
        suggestedCode={suggestedCode}
        action={saveStudentAction.bind(null, null)}
        submitLabel="Save student"
      />
    </div>
  )
}
