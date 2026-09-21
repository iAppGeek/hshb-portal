import { type Metadata } from 'next'

import { requireSession } from '@/auth/require'
import { getStudentsForList, getStudentsByTeacher } from '@/db'
import type { IncidentType } from '@/db'
import { isTeacher } from '@/lib/permissions'

import PageHeader, { RequiredFieldsNote } from '../../_components/PageHeader'
import { saveIncidentAction } from '../actions'
import IncidentForm from '../IncidentForm'

export const metadata: Metadata = { title: 'Add Incident' }

export default async function AddIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const actor = await requireSession()
  const role = actor.role
  const staffId = actor.staffId
  const { type } = await searchParams
  const incidentType: IncidentType =
    type === 'behaviour' ? 'behaviour' : 'medical'

  const students = isTeacher(role)
    ? await getStudentsByTeacher(staffId)
    : await getStudentsForList()

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Add Incident"
        subtitle={RequiredFieldsNote}
        backHref="/incidents"
        backLabel="Incidents"
      />
      <IncidentForm
        students={students}
        defaultType={incidentType}
        action={saveIncidentAction.bind(null, null)}
        submitLabel="Add Incident"
      />
    </div>
  )
}
