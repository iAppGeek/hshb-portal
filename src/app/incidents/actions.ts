'use server'

import { createIncident, updateIncident } from '@/db'
import { runAction, type ActionResult } from '@/lib/action'
import { datetimeLocalToUtcIso } from '@/lib/datetime'
import { canEditIncidents } from '@/lib/permissions'
import { createIncidentSchema, updateIncidentSchema } from '@/lib/schemas'

function notifiedAt(
  parentNotified: boolean,
  parentNotifiedAt: string | null,
): string | null {
  return parentNotified && parentNotifiedAt
    ? datetimeLocalToUtcIso(parentNotifiedAt)
    : null
}

// TODO(plan-05): align with canEditIncidents
export async function createIncidentAction(
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'incidents.create',
    schema: createIncidentSchema,
    formData,
    run: async (
      { type, parent_notified, parent_notified_at, incident_date, ...rest },
      { actor },
    ) => {
      const incident = await createIncident({
        type,
        ...rest,
        incident_date: datetimeLocalToUtcIso(incident_date),
        created_by: actor.staffId,
        parent_notified,
        parent_notified_at: notifiedAt(parent_notified, parent_notified_at),
      })
      return { id: incident.id, type }
    },
    audit: {
      entity: 'incident',
      action: 'create',
      entityId: (result) => result.id,
    },
    revalidate: ['/incidents'],
    redirectTo: (result) => `/incidents?tab=${result.type}`,
    fallbackError: 'Failed to create incident. Please try again.',
  })
}

export async function updateIncidentAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'incidents.update',
    permission: canEditIncidents,
    schema: updateIncidentSchema,
    formData,
    run: async (
      { type, parent_notified, parent_notified_at, incident_date, ...rest },
      { actor },
    ) => {
      await updateIncident(id, {
        ...rest,
        incident_date: datetimeLocalToUtcIso(incident_date),
        updated_by: actor.staffId,
        parent_notified,
        parent_notified_at: notifiedAt(parent_notified, parent_notified_at),
      })
      return { type }
    },
    audit: { entity: 'incident', action: 'update', entityId: () => id },
    revalidate: ['/incidents'],
    redirectTo: (result) => `/incidents?tab=${result.type}`,
    fallbackError: 'Failed to update incident. Please try again.',
  })
}
