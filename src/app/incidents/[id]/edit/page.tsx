import { type Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getIncidentById } from '@/db'
import { canEditIncidents } from '@/lib/permissions'

import PageHeader, { RequiredFieldsNote } from '../../../_components/PageHeader'

import EditIncidentForm from './EditIncidentForm'

export const metadata: Metadata = { title: 'Edit Incident' }

export default async function EditIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const actor = await requireSession()
  const role = actor.role

  if (!canEditIncidents(role)) {
    redirect('/incidents')
  }

  const { id } = await params
  const incident = await getIncidentById(id)

  if (!incident) {
    notFound()
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Edit Incident"
        subtitle={RequiredFieldsNote}
        backHref="/incidents"
        backLabel="Incidents"
      />
      <EditIncidentForm incident={incident} />
    </div>
  )
}
