import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import {
  createDocument,
  updateDocument,
  softDeleteDocument,
  getDocumentById,
  logAuditEvent,
} from '@/db'
import { getFileStorage } from '@/lib/storage'

import {
  uploadDocumentAction,
  linkDocumentAction,
  createRecordAction,
  updateDocumentAction,
  deleteDocumentAction,
} from './actions'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  softDeleteDocument: vi.fn(),
  getDocumentById: vi.fn(),
  logAuditEvent: vi.fn(),
}))
vi.mock('@/lib/storage', () => ({ getFileStorage: vi.fn() }))

const storage = {
  upload: vi.fn(),
  getDownloadUrl: vi.fn(),
  delete: vi.fn(),
}

const adminSession = { user: { staffId: 'admin-1', role: 'admin' } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(adminSession as never)
  vi.mocked(getFileStorage).mockReturnValue(storage as never)
  storage.upload.mockResolvedValue(undefined)
  storage.delete.mockResolvedValue(undefined)
  storage.getDownloadUrl.mockResolvedValue('https://dl')
  vi.mocked(createDocument).mockResolvedValue({ id: 'new-doc' } as never)
})

function fd(fields: Record<string, string>): FormData {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return form
}

const baseEnvelope = {
  owner_type: 'student',
  owner_id: '11111111-1111-4111-8111-111111111111',
  name: 'My doc',
  type: 'medical_consent',
  expires_at: 'never',
}

describe('uploadDocumentAction', () => {
  function uploadForm(
    overrides: Record<string, string> = {},
    file = new File([new Uint8Array([1, 2, 3])], 'scan.pdf', {
      type: 'application/pdf',
    }),
  ): FormData {
    const form = fd({ ...baseEnvelope, ...overrides })
    form.set('file', file)
    return form
  }

  it('rejects non-managers without uploading', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: 't', role: 'teacher' },
    } as never)
    const result = await uploadDocumentAction(uploadForm())
    expect(result).toEqual({ error: 'Not authorised' })
    expect(storage.upload).not.toHaveBeenCalled()
    expect(createDocument).not.toHaveBeenCalled()
  })

  it('uploads then inserts with a server-generated key and derived size/mime', async () => {
    await uploadDocumentAction(uploadForm())
    expect(storage.upload).toHaveBeenCalledTimes(1)
    const [key, , mime] = storage.upload.mock.calls[0]
    expect(key).toMatch(/^student\/11111111-1111-4111-8111-111111111111\//)
    expect(key).toMatch(/\.pdf$/)
    expect(mime).toBe('application/pdf')
    expect(createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'upload',
        storage_key: key,
        file_name: 'scan.pdf',
        file_size: 3,
        mime_type: 'application/pdf',
        expires_at: null,
      }),
    )
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        entity: 'document',
        entityId: 'new-doc',
      }),
    )
    expect(revalidatePath).toHaveBeenCalledWith(
      '/students/11111111-1111-4111-8111-111111111111/edit',
    )
  })

  it('rejects an oversize file before uploading', async () => {
    const big = new File([new Uint8Array(9 * 1024 * 1024)], 'big.pdf', {
      type: 'application/pdf',
    })
    const result = await uploadDocumentAction(uploadForm({}, big))
    expect(result).toEqual({ error: 'File is too large (maximum 8 MB)' })
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('rejects a disallowed MIME type before uploading', async () => {
    const exe = new File([new Uint8Array([1])], 'x.exe', {
      type: 'application/x-msdownload',
    })
    const result = await uploadDocumentAction(uploadForm({}, exe))
    expect(result).toEqual({ error: 'Unsupported file type' })
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('cleans up the uploaded blob when the insert fails', async () => {
    vi.mocked(createDocument).mockRejectedValue(new Error('insert failed'))
    const result = await uploadDocumentAction(uploadForm())
    expect(storage.upload).toHaveBeenCalled()
    expect(storage.delete).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ error: expect.any(String) })
  })

  it('rejects a record-mode type', async () => {
    const result = await uploadDocumentAction(uploadForm({ type: 'dbs_check' }))
    expect(result).toEqual({ error: 'This type does not take a file' })
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('rejects when no file is chosen', async () => {
    const form = fd(baseEnvelope)
    form.set('file', new File([], '', { type: '' }))
    const result = await uploadDocumentAction(form)
    expect(result).toEqual({ error: 'Choose a file to upload' })
  })
})

describe('linkDocumentAction', () => {
  it('inserts a link document and logs a create audit', async () => {
    await linkDocumentAction(
      fd({ ...baseEnvelope, external_url: 'https://example.com/a.pdf' }),
    )
    expect(createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'link',
        external_url: 'https://example.com/a.pdf',
      }),
    )
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', entity: 'document' }),
    )
  })

  it('rejects an invalid URL', async () => {
    const result = await linkDocumentAction(
      fd({ ...baseEnvelope, external_url: 'not-a-url' }),
    )
    expect(result).toMatchObject({ error: expect.any(String) })
    expect(createDocument).not.toHaveBeenCalled()
  })
})

describe('createRecordAction', () => {
  const recordEnvelope = {
    owner_type: 'staff',
    owner_id: '22222222-2222-4222-8222-222222222222',
    name: 'DBS',
    type: 'dbs_check',
    expires_at: 'never',
  }

  it('inserts a record with the serialised fields and logs them in the audit', async () => {
    const fields = [
      { field: 'Certificate No', value: '123' },
      { field: 'Status', value: 'Clear' },
    ]
    await createRecordAction(
      fd({ ...recordEnvelope, fields: JSON.stringify(fields) }),
    )
    expect(createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'record', fields }),
    )
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        entity: 'document',
        details: expect.objectContaining({ fields }),
      }),
    )
  })

  it('rejects an empty fields list', async () => {
    const result = await createRecordAction(
      fd({ ...recordEnvelope, fields: JSON.stringify([]) }),
    )
    expect(result).toMatchObject({ error: expect.any(String) })
    expect(createDocument).not.toHaveBeenCalled()
  })

  it('rejects a file-mode type', async () => {
    const result = await createRecordAction(
      fd({
        ...recordEnvelope,
        type: 'contract',
        fields: JSON.stringify([{ field: 'a', value: 'b' }]),
      }),
    )
    expect(result).toEqual({ error: 'This type is not a record' })
  })
})

describe('updateDocumentAction', () => {
  it('updates a record envelope + fields and logs a before/after diff', async () => {
    vi.mocked(getDocumentById).mockResolvedValue({
      id: 'doc-1',
      source: 'record',
      student_id: null,
      staff_id: '22222222-2222-4222-8222-222222222222',
      name: 'Old',
      type: 'dbs_check',
      expires_at: null,
      other: null,
      fields: [{ field: 'Status', value: 'Pending' }],
    } as never)
    const fields = [{ field: 'Status', value: 'Clear' }]
    await updateDocumentAction(
      'doc-1',
      fd({
        name: 'New',
        type: 'dbs_check',
        expires_at: 'never',
        fields: JSON.stringify(fields),
      }),
    )
    expect(updateDocument).toHaveBeenCalledWith(
      'doc-1',
      expect.objectContaining({ name: 'New', fields }),
    )
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        details: expect.objectContaining({
          before: expect.objectContaining({ name: 'Old' }),
          after: expect.objectContaining({ name: 'New', fields }),
        }),
      }),
    )
  })

  it('rejects when the chosen type changes mode', async () => {
    vi.mocked(getDocumentById).mockResolvedValue({
      id: 'doc-1',
      source: 'upload',
      student_id: '11111111-1111-4111-8111-111111111111',
      staff_id: null,
      name: 'File',
      type: 'contract',
      expires_at: null,
      other: null,
      fields: null,
    } as never)
    const result = await updateDocumentAction(
      'doc-1',
      fd({ name: 'File', type: 'dbs_check', expires_at: 'never' }),
    )
    expect(result).toEqual({ error: 'Type does not match this item' })
    expect(updateDocument).not.toHaveBeenCalled()
  })

  it('returns an error when the document is missing', async () => {
    vi.mocked(getDocumentById).mockResolvedValue(null)
    const result = await updateDocumentAction(
      'missing',
      fd({ name: 'x', type: 'contract', expires_at: 'never' }),
    )
    expect(result).toEqual({ error: 'Document not found' })
  })
})

describe('deleteDocumentAction', () => {
  it('soft-deletes and logs a delete audit', async () => {
    vi.mocked(getDocumentById).mockResolvedValue({
      id: 'doc-1',
      source: 'link',
      student_id: '11111111-1111-4111-8111-111111111111',
      staff_id: null,
      name: 'Consent',
      type: 'medical_consent',
    } as never)
    await deleteDocumentAction('doc-1')
    expect(softDeleteDocument).toHaveBeenCalledWith('doc-1', 'admin-1')
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete', entity: 'document' }),
    )
  })

  it('rejects non-managers', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: 't', role: 'teacher' },
    } as never)
    const result = await deleteDocumentAction('doc-1')
    expect(result).toEqual({ error: 'Not authorised' })
    expect(softDeleteDocument).not.toHaveBeenCalled()
  })
})
