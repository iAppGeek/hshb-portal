import { type Metadata } from 'next'

import { requireSession } from '@/auth/require'
import { getIncidents, getStudentIdsByTeacher } from '@/db'
import type { IncidentRow } from '@/db'
import { isTeacher, canEditIncidents } from '@/lib/permissions'

import IncidentsClient from './IncidentsClient'

export const metadata: Metadata = { title: 'Incidents' }

export default async function IncidentsPage() {
  const actor = await requireSession()
  const role = actor.role
  const staffId = actor.staffId
  const teacherOnly = isTeacher(role)
  const canEdit = canEditIncidents(role)

  let incidents: IncidentRow[]

  if (teacherOnly) {
    const studentIds = await getStudentIdsByTeacher(staffId)
    incidents = await getIncidents({ studentIds, limit: 50 })
  } else {
    incidents = await getIncidents({ limit: 50 })
  }

  return (
    <IncidentsClient
      incidents={incidents}
      role={role}
      staffId={staffId}
      canEdit={canEdit}
    />
  )
}
