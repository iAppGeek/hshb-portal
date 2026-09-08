import { unstable_cache, revalidateTag } from 'next/cache'

import type { Json } from '@/types/database'

import { supabase } from './client'

export type DocumentSource = 'upload' | 'link' | 'record'

/** One FIELD:VALUE pair of a record (source='record'). */
export type DocumentField = { field: string; value: string }

export type DocumentRow = {
  id: string
  student_id: string | null
  staff_id: string | null
  name: string
  type: string
  expires_at: string | null
  other: string | null
  source: DocumentSource
  storage_key: string | null
  external_url: string | null
  fields: DocumentField[] | null
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  created_by: string
  updated_by: string | null
  deleted_at: string | null
  deleted_by: string | null
  created_at: string
  updated_at: string
}

type Person = { id: string; first_name: string; last_name: string }

/** A soft-deleted row joined to its owner + the staff member who deleted it. */
export type DeletedDocumentRow = DocumentRow & {
  student: Person | null
  staff: Person | null
  deleter: Person | null
}

const DOCUMENT_SELECT = `
  id, student_id, staff_id, name, type, expires_at, other, source,
  storage_key, external_url, fields, file_name, file_size, mime_type,
  created_by, updated_by, deleted_at, deleted_by, created_at, updated_at
`

const DELETED_DOCUMENT_SELECT = `
  ${DOCUMENT_SELECT},
  student:students(id, first_name, last_name),
  staff:staff!documents_staff_id_fkey(id, first_name, last_name),
  deleter:staff!documents_deleted_by_fkey(id, first_name, last_name)
`

// Note on retention / GDPR: soft delete keeps the row AND the stored bytes
// indefinitely (admin records). Combined with ON DELETE CASCADE on the owner
// FKs — which removes rows but NOT the external bytes when a student/staff is
// hard-deleted — this leaves orphaned bytes by design. A future scheduled
// hard-purge / erasure job (using FileStorageProvider.delete) is the intended
// remedy; it is deliberately out of scope here.

export const getDocumentsForStudent = unstable_cache(
  async (studentId: string): Promise<DocumentRow[]> => {
    const { data, error } = await supabase
      .from('documents')
      .select(DOCUMENT_SELECT)
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as DocumentRow[]
  },
  ['documents-for-student'],
  { revalidate: 60, tags: ['documents'] },
)

export const getDocumentsForStaff = unstable_cache(
  async (staffId: string): Promise<DocumentRow[]> => {
    const { data, error } = await supabase
      .from('documents')
      .select(DOCUMENT_SELECT)
      .eq('staff_id', staffId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as DocumentRow[]
  },
  ['documents-for-staff'],
  { revalidate: 60, tags: ['documents'] },
)

export const getDeletedDocuments = unstable_cache(
  async (): Promise<DeletedDocumentRow[]> => {
    const { data, error } = await supabase
      .from('documents')
      .select(DELETED_DOCUMENT_SELECT)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as DeletedDocumentRow[]
  },
  ['documents-deleted'],
  { revalidate: 60, tags: ['documents', 'documents-deleted'] },
)

/** Returns the row regardless of `deleted_at` — admins still view deleted files. */
export async function getDocumentById(id: string): Promise<DocumentRow | null> {
  const { data, error } = await supabase
    .from('documents')
    .select(DOCUMENT_SELECT)
    .eq('id', id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as DocumentRow
}

export type CreateDocumentInput = {
  owner_type: 'student' | 'staff'
  owner_id: string
  name: string
  type: string
  expires_at: string | null
  other: string | null
  source: DocumentSource
  storage_key?: string | null
  external_url?: string | null
  fields?: DocumentField[] | null
  file_name?: string | null
  file_size?: number | null
  mime_type?: string | null
  created_by: string
}

export async function createDocument(
  input: CreateDocumentInput,
): Promise<DocumentRow> {
  const { owner_type, owner_id, ...rest } = input
  const { data, error } = await supabase
    .from('documents')
    .insert({
      ...rest,
      student_id: owner_type === 'student' ? owner_id : null,
      staff_id: owner_type === 'staff' ? owner_id : null,
      fields: (rest.fields ?? null) as Json,
    })
    .select(DOCUMENT_SELECT)
    .single()
  if (error) throw error
  revalidateTag('documents', 'max')
  return data as DocumentRow
}

export type UpdateDocumentInput = {
  name: string
  type: string
  expires_at: string | null
  other: string | null
  fields?: DocumentField[] | null
  updated_by: string
}

export async function updateDocument(
  id: string,
  input: UpdateDocumentInput,
): Promise<DocumentRow> {
  const { fields, ...rest } = input
  const patch: {
    name: string
    type: string
    expires_at: string | null
    other: string | null
    updated_by: string
    fields?: Json
  } = { ...rest }
  // Only records carry fields; never touch it for file-backed rows.
  if (fields !== undefined) patch.fields = fields as Json
  const { data, error } = await supabase
    .from('documents')
    .update(patch)
    .eq('id', id)
    .select(DOCUMENT_SELECT)
    .single()
  if (error) throw error
  revalidateTag('documents', 'max')
  return data as DocumentRow
}

/**
 * Soft delete: sets `deleted_at`/`deleted_by`. Never deletes the row and never
 * calls storage — the bytes stay in the backend for admin records.
 */
export async function softDeleteDocument(
  id: string,
  deletedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
    .eq('id', id)
  if (error) throw error
  revalidateTag('documents', 'max')
  revalidateTag('documents-deleted', 'max')
}
