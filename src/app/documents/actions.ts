'use server'

import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import {
  createDocument,
  updateDocument,
  softDeleteDocument,
  getDocumentById,
  logAuditEvent,
} from '@/db'
import { getUserFriendlyDbError } from '@/lib/db-error'
import { canManageDocuments } from '@/lib/permissions'
import { getDocumentType } from '@/lib/documentTypes'
import { getFileStorage } from '@/lib/storage'
import {
  extractFormFields,
  uploadDocumentSchema,
  linkDocumentSchema,
  createRecordSchema,
  updateDocumentSchema,
  type ActionResult,
} from '@/lib/schemas'
import type { StaffRole } from '@/types/next-auth'

// Keep in step with next.config.js `serverActions.bodySizeLimit` — a file
// larger than the body limit never reaches this action.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
}

type Manager = { staffId: string }

async function requireManager(): Promise<Manager | { error: string }> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canManageDocuments(role)) return { error: 'Not authorised' }
  return { staffId: session.user.staffId }
}

function ownerEditPath(
  ownerType: 'student' | 'staff',
  ownerId: string,
): string {
  return `/${ownerType === 'student' ? 'students' : 'staff'}/${ownerId}/edit`
}

function revalidateOwner(
  ownerType: 'student' | 'staff',
  ownerId: string,
): void {
  revalidatePath(ownerEditPath(ownerType, ownerId))
  revalidatePath('/documents/deleted')
}

/** Derive a short, safe extension from the original filename or the MIME type. */
function safeExtension(fileName: string, mime: string): string {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]{1,8})$/)
  if (match) return `.${match[1]}`
  return EXT_BY_MIME[mime] ?? ''
}

/** Parse the `fields` form value (a JSON string) into an array for Zod. */
function parseFieldsInto(raw: Record<string, unknown>): boolean {
  if (typeof raw.fields !== 'string') return true
  try {
    raw.fields = JSON.parse(raw.fields)
    return true
  } catch {
    return false
  }
}

export async function uploadDocumentAction(
  formData: FormData,
): Promise<ActionResult> {
  const authed = await requireManager()
  if ('error' in authed) return authed

  const parsed = uploadDocumentSchema.safeParse(extractFormFields(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const env = parsed.data

  if (getDocumentType(env.type)?.mode !== 'file') {
    return { error: 'This type does not take a file' }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a file to upload' }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: 'File is too large (maximum 8 MB)' }
  }
  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME.has(mime)) {
    return { error: 'Unsupported file type' }
  }

  const key = `${env.owner_type}/${env.owner_id}/${crypto.randomUUID()}${safeExtension(
    file.name,
    mime,
  )}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const storage = getFileStorage()

  try {
    await storage.upload(key, bytes, mime)
  } catch (err) {
    console.error('[uploadDocumentAction] upload error:', err)
    return { error: 'Failed to upload the file. Please try again.' }
  }

  try {
    const row = await createDocument({
      owner_type: env.owner_type,
      owner_id: env.owner_id,
      name: env.name,
      type: env.type,
      expires_at: env.expires_at,
      other: env.other ?? null,
      source: 'upload',
      storage_key: key,
      file_name: file.name,
      file_size: file.size,
      mime_type: mime,
      created_by: authed.staffId,
    })
    logAuditEvent({
      staffId: authed.staffId,
      action: 'create',
      entity: 'document',
      entityId: row.id,
      details: {
        source: 'upload',
        ownerType: env.owner_type,
        ownerId: env.owner_id,
        name: env.name,
        type: env.type,
        expires_at: env.expires_at,
        file_name: file.name,
        file_size: file.size,
        mime_type: mime,
      },
    })
  } catch (err) {
    // Orphan cleanup: bytes uploaded but the row failed to insert.
    await storage.delete(key).catch(() => {})
    console.error('[uploadDocumentAction] insert error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to save the document. Please try again.',
      ),
    }
  }

  revalidateOwner(env.owner_type, env.owner_id)
}

export async function linkDocumentAction(
  formData: FormData,
): Promise<ActionResult> {
  const authed = await requireManager()
  if ('error' in authed) return authed

  const parsed = linkDocumentSchema.safeParse(extractFormFields(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const env = parsed.data

  if (getDocumentType(env.type)?.mode !== 'file') {
    return { error: 'This type does not take a link' }
  }

  try {
    const row = await createDocument({
      owner_type: env.owner_type,
      owner_id: env.owner_id,
      name: env.name,
      type: env.type,
      expires_at: env.expires_at,
      other: env.other ?? null,
      source: 'link',
      external_url: env.external_url,
      created_by: authed.staffId,
    })
    logAuditEvent({
      staffId: authed.staffId,
      action: 'create',
      entity: 'document',
      entityId: row.id,
      details: {
        source: 'link',
        ownerType: env.owner_type,
        ownerId: env.owner_id,
        name: env.name,
        type: env.type,
        expires_at: env.expires_at,
        external_url: env.external_url,
      },
    })
  } catch (err) {
    console.error('[linkDocumentAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to save the link. Please try again.',
      ),
    }
  }

  revalidateOwner(env.owner_type, env.owner_id)
}

export async function createRecordAction(
  formData: FormData,
): Promise<ActionResult> {
  const authed = await requireManager()
  if ('error' in authed) return authed

  const raw = extractFormFields(formData)
  if (!parseFieldsInto(raw)) return { error: 'Invalid record fields' }

  const parsed = createRecordSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const env = parsed.data

  if (getDocumentType(env.type)?.mode !== 'record') {
    return { error: 'This type is not a record' }
  }

  try {
    const row = await createDocument({
      owner_type: env.owner_type,
      owner_id: env.owner_id,
      name: env.name,
      type: env.type,
      expires_at: env.expires_at,
      other: env.other ?? null,
      source: 'record',
      fields: env.fields,
      created_by: authed.staffId,
    })
    logAuditEvent({
      staffId: authed.staffId,
      action: 'create',
      entity: 'document',
      entityId: row.id,
      details: {
        source: 'record',
        ownerType: env.owner_type,
        ownerId: env.owner_id,
        name: env.name,
        type: env.type,
        expires_at: env.expires_at,
        fields: env.fields,
      },
    })
  } catch (err) {
    console.error('[createRecordAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to save the record. Please try again.',
      ),
    }
  }

  revalidateOwner(env.owner_type, env.owner_id)
}

export async function updateDocumentAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const authed = await requireManager()
  if ('error' in authed) return authed

  const existing = await getDocumentById(id)
  if (!existing) return { error: 'Document not found' }

  const raw = extractFormFields(formData)
  if (!parseFieldsInto(raw)) return { error: 'Invalid record fields' }

  const parsed = updateDocumentSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const data = parsed.data

  const isRecord = existing.source === 'record'
  const newMode = getDocumentType(data.type)?.mode
  // The chosen type's mode must match the existing row's kind — the file/source
  // is never editable, so a record can't become a file type or vice-versa.
  if ((isRecord && newMode !== 'record') || (!isRecord && newMode !== 'file')) {
    return { error: 'Type does not match this item' }
  }
  if (isRecord && (!data.fields || data.fields.length === 0)) {
    return { error: 'Add at least one field' }
  }

  const ownerType: 'student' | 'staff' = existing.student_id
    ? 'student'
    : 'staff'
  const ownerId = existing.student_id ?? existing.staff_id ?? ''

  try {
    await updateDocument(id, {
      name: data.name,
      type: data.type,
      expires_at: data.expires_at,
      other: data.other ?? null,
      ...(isRecord ? { fields: data.fields } : {}),
      updated_by: authed.staffId,
    })
    logAuditEvent({
      staffId: authed.staffId,
      action: 'update',
      entity: 'document',
      entityId: id,
      details: {
        before: {
          name: existing.name,
          type: existing.type,
          expires_at: existing.expires_at,
          other: existing.other,
          ...(isRecord ? { fields: existing.fields } : {}),
        },
        after: {
          name: data.name,
          type: data.type,
          expires_at: data.expires_at,
          other: data.other,
          ...(isRecord ? { fields: data.fields } : {}),
        },
      },
    })
  } catch (err) {
    console.error('[updateDocumentAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to update the document. Please try again.',
      ),
    }
  }

  revalidateOwner(ownerType, ownerId)
}

export async function deleteDocumentAction(id: string): Promise<ActionResult> {
  const authed = await requireManager()
  if ('error' in authed) return authed

  const existing = await getDocumentById(id)
  if (!existing) return { error: 'Document not found' }

  const ownerType: 'student' | 'staff' = existing.student_id
    ? 'student'
    : 'staff'
  const ownerId = existing.student_id ?? existing.staff_id ?? ''

  try {
    await softDeleteDocument(id, authed.staffId)
    logAuditEvent({
      staffId: authed.staffId,
      action: 'delete',
      entity: 'document',
      entityId: id,
      details: {
        ownerType,
        ownerId,
        name: existing.name,
        type: existing.type,
        source: existing.source,
      },
    })
  } catch (err) {
    console.error('[deleteDocumentAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to delete the document. Please try again.',
      ),
    }
  }

  revalidateOwner(ownerType, ownerId)
}
