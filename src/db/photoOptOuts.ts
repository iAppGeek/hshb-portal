import 'server-only'

import { and, count, desc, eq } from 'drizzle-orm'

import { DbError } from '@/lib/db-error'
import { isUuid } from '@/lib/uuid'

import { toCamel, toSnake, type Snake } from './casing'
import { db } from './client'
import {
  photoConsentOptOuts,
  photoOptOutStatus,
  type NewPhotoConsentOptOut,
  type PhotoConsentOptOut,
} from './schema'
import { withdrawPhotoVideoConsent } from './students'

export type PhotoOptOutStatus = (typeof photoOptOutStatus.enumValues)[number]
export type PhotoOptOutRow = Snake<PhotoConsentOptOut>

export async function createPhotoOptOut(
  input: Snake<NewPhotoConsentOptOut>,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(photoConsentOptOuts)
    .values(toCamel(input))
    .returning({ id: photoConsentOptOuts.id })
  return row
}

export async function getPhotoOptOuts(
  status: PhotoOptOutStatus | 'all',
): Promise<PhotoOptOutRow[]> {
  const rows = await db
    .select()
    .from(photoConsentOptOuts)
    .where(
      status === 'all' ? undefined : eq(photoConsentOptOuts.status, status),
    )
    .orderBy(desc(photoConsentOptOuts.submittedAt))
  return toSnake(rows)
}

export async function getPendingPhotoOptOutCount(): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(photoConsentOptOuts)
    .where(eq(photoConsentOptOuts.status, 'pending'))
  return n
}

export async function getPhotoOptOutById(
  id: string,
): Promise<PhotoOptOutRow | null> {
  // A malformed id finds nothing, rather than failing the uuid cast.
  if (!isUuid(id)) return null

  const [row] = await db
    .select()
    .from(photoConsentOptOuts)
    .where(eq(photoConsentOptOuts.id, id))
  return row ? toSnake(row) : null
}

type ApplyPhotoOptOutInput = {
  requestId: string
  staffId: string
  studentId: string
}

/**
 * Withdraws the student's photo/video consent, recording who and when, and
 * marks the request actioned.
 */
export async function applyPhotoOptOut({
  requestId,
  staffId,
  studentId,
}: ApplyPhotoOptOutInput): Promise<string> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select({ id: photoConsentOptOuts.id })
      .from(photoConsentOptOuts)
      .where(
        and(
          eq(photoConsentOptOuts.id, requestId),
          eq(photoConsentOptOuts.status, 'pending'),
        ),
      )
      .for('update')
    if (!request) throw new DbError('Request not found or already actioned')

    await withdrawPhotoVideoConsent(studentId, staffId, tx)

    await tx
      .update(photoConsentOptOuts)
      .set({
        status: 'actioned',
        actionedBy: staffId,
        actionedAt: new Date().toISOString(),
        studentId,
      })
      .where(eq(photoConsentOptOuts.id, requestId))
    return studentId
  })
}

type RejectPhotoOptOutInput = {
  requestId: string
  staffId: string
  reason: string
}

export async function rejectPhotoOptOut({
  requestId,
  staffId,
  reason,
}: RejectPhotoOptOutInput): Promise<void> {
  const rows = await db
    .update(photoConsentOptOuts)
    .set({
      status: 'rejected',
      rejectedReason: reason,
      actionedBy: staffId,
      actionedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(photoConsentOptOuts.id, requestId),
        eq(photoConsentOptOuts.status, 'pending'),
      ),
    )
    .returning({ id: photoConsentOptOuts.id })
  if (rows.length === 0)
    throw new Error('Request not found or already actioned')
}

export async function deletePhotoOptOut(id: string): Promise<void> {
  const rows = await db
    .delete(photoConsentOptOuts)
    .where(eq(photoConsentOptOuts.id, id))
    .returning({ id: photoConsentOptOuts.id })
  if (rows.length === 0) throw new Error('Request not found')
}
