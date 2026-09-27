import { type Metadata } from 'next'

import { requireSession } from '@/auth/require'
import { getStudentSummaries } from '@/db'
import type { IncidentType } from '@/db'

import PageHeader, { RequiredFieldsNote } from '../../_components/PageHeader'
import { saveIncidentAction } from '../actions'
import IncidentForm from '../IncidentForm'

export const metadata: Metadata = { title: 'Add Incident' }

/**
 * Any member of staff may witness an incident, so every signed-in role picks
 * from all active students, identified by name and class.
 */
export default async function AddIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  await requireSession()
  const { type } = await searchParams
  const incidentType: IncidentType =
    type === 'behaviour' ? 'behaviour' : 'medical'

  const students = await getStudentSummaries()

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
