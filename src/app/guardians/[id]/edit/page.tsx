import { type Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getGuardianById, getStudentsByGuardian } from '@/db'
import { canEditGuardians } from '@/lib/permissions'

import PageHeader, { RequiredFieldsNote } from '../../../_components/PageHeader'

import EditGuardianForm from './EditGuardianForm'

export const metadata: Metadata = { title: 'Edit Guardian' }

export default async function EditGuardianPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const actor = await requireSession()
  const role = actor.role

  if (!canEditGuardians(role)) {
    redirect('/students')
  }

  const { id } = await params

  const [guardian, linkedStudents] = await Promise.all([
    getGuardianById(id),
    getStudentsByGuardian(id),
  ])

  if (!guardian) {
    notFound()
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={`Edit Guardian: ${guardian.last_name}, ${guardian.first_name}`}
        subtitle={RequiredFieldsNote}
        backHref={`/guardians/${id}`}
        backLabel="Guardian"
      />

      <EditGuardianForm guardian={guardian} linkedStudents={linkedStudents} />
    </div>
  )
}
