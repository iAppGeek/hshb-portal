import 'server-only'

import { logError } from '@/lib/log'

import { db } from './client'
import { auditLog } from './schema'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'sign_in'
  | 'sign_out'
  | 'registration_submitted'
  | 'registration_approved'
  | 'registration_rejected'
  | 'registration_deleted'
  | 'photo_opt_out_submitted'
  | 'photo_opt_out_applied'
  | 'photo_opt_out_rejected'
  | 'photo_opt_out_deleted'

export type AuditEntry = {
  staffId: string | null
  action: AuditAction
  entity: string
  entityId?: string
  details?: Record<string, unknown>
}

/** Fire-and-forget: a failed audit write is logged, never surfaced to the user. */
export function logAuditEvent(entry: AuditEntry): void {
  db.insert(auditLog)
    .values({
      staffId: entry.staffId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      details: entry.details ?? null,
    })
    .then(
      () => undefined,
      (err: unknown) => logError('audit-log', err),
    )
}
