'use server'

import { createIncident, updateIncident } from '@/db'
import { runAction, type ActionResult } from '@/lib/action'
import { datetimeLocalToUtcIso } from '@/lib/datetime'
import { canEditIncidents } from '@/lib/permissions'
import { createIncidentSchema, updateIncidentSchema } from '@/lib/schemas'

function notifiedAt(
  parentNotified: boolean,
  parentNotifiedAt: string | null | undefined,
): string | null {
  return parentNotified && parentNotifiedAt
    ? datetimeLocalToUtcIso(parentNotifiedAt)
    : null
}

/**
 * Any signed-in staff member can record an incident against any student — any
 * member of staff may witness one, and the new-incident page identifies the
 * student by name and class. Only `canEditIncidents` can edit an existing one.
 * The student is fixed once recorded, so only creating parses `student_id`.
 */
export async function saveIncidentAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  if (id === null) {
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
      redirectTo: (result) => `/incidents?tab=${result.type}`,
      fallbackError: 'Failed to create incident. Please try again.',
    })
  }

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
    redirectTo: (result) => `/incidents?tab=${result.type}`,
    fallbackError: 'Failed to update incident. Please try again.',
  })
}
