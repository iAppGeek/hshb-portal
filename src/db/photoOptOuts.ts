import 'server-only'

import { and, count, desc, eq } from 'drizzle-orm'

import { toCamel, toSnake, type Snake } from './casing'
import { db, supabase } from './client'
import {
  photoConsentOptOuts,
  photoOptOutStatus,
  type NewPhotoConsentOptOut,
  type PhotoConsentOptOut,
} from './schema'

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

export async function applyPhotoOptOut({
  requestId,
  staffId,
  studentId,
}: ApplyPhotoOptOutInput): Promise<string> {
  const { data, error } = await supabase.rpc('apply_photo_opt_out', {
    p_request_id: requestId,
    p_staff_id: staffId,
    p_student_id: studentId,
  })
  if (error) throw error
  return data as string
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
