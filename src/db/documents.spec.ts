import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidateTag } from 'next/cache'

import {
  getDocumentsForStudent,
  getDocumentsForStaff,
  getDeletedDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  softDeleteDocument,
} from './documents'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

vi.mock('./client', () => ({
  supabase: { from: mockFrom },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const liveDoc = {
  id: 'doc-1',
  student_id: 'student-1',
  staff_id: null,
  name: 'Consent form',
  type: 'medical_consent',
  expires_at: null,
  other: null,
  source: 'link',
  storage_key: null,
  external_url: 'https://example.com/c.pdf',
  fields: null,
  file_name: null,
  file_size: null,
  mime_type: null,
  created_by: 'staff-1',
  updated_by: null,
  deleted_at: null,
  deleted_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('getDocumentsForStudent', () => {
  it('returns live documents filtered by student and deleted_at IS NULL', async () => {
    const order = vi.fn().mockResolvedValue({ data: [liveDoc], error: null })
    const is = vi.fn().mockReturnValue({ order })
    const eq = vi.fn().mockReturnValue({ is })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) })

    const result = await getDocumentsForStudent('student-1')
    expect(result).toEqual([liveDoc])
    expect(mockFrom).toHaveBeenCalledWith('documents')
    expect(eq).toHaveBeenCalledWith('student_id', 'student-1')
    expect(is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('throws when the query errors', async () => {
    const order = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('DB error') })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ order }) }),
      }),
    })
    await expect(getDocumentsForStudent('student-1')).rejects.toThrow(
      'DB error',
    )
  })
})

describe('getDocumentsForStaff', () => {
  it('filters by staff_id and deleted_at IS NULL', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const is = vi.fn().mockReturnValue({ order })
    const eq = vi.fn().mockReturnValue({ is })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) })

    const result = await getDocumentsForStaff('staff-1')
    expect(result).toEqual([])
    expect(eq).toHaveBeenCalledWith('staff_id', 'staff-1')
    expect(is).toHaveBeenCalledWith('deleted_at', null)
  })
})

describe('getDeletedDocuments', () => {
  it('returns only soft-deleted rows ordered by deleted_at desc', async () => {
    const deletedDoc = { ...liveDoc, deleted_at: '2026-02-01T00:00:00Z' }
    const order = vi.fn().mockResolvedValue({ data: [deletedDoc], error: null })
    const not = vi.fn().mockReturnValue({ order })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ not }) })

    const result = await getDeletedDocuments()
    expect(result).toEqual([deletedDoc])
    expect(not).toHaveBeenCalledWith('deleted_at', 'is', null)
    expect(order).toHaveBeenCalledWith('deleted_at', { ascending: false })
  })
})

describe('getDocumentById', () => {
  it('returns the row regardless of deleted_at', async () => {
    const single = vi.fn().mockResolvedValue({ data: liveDoc, error: null })
    mockFrom.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }),
    })
    const result = await getDocumentById('doc-1')
    expect(result).toEqual(liveDoc)
  })

  it('returns null on PGRST116 (not found)', async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    mockFrom.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }),
    })
    expect(await getDocumentById('missing')).toBeNull()
  })

  it('throws on other errors', async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: 'XX', message: 'boom' } })
    mockFrom.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }),
    })
    await expect(getDocumentById('doc-1')).rejects.toBeTruthy()
  })
})

describe('createDocument', () => {
  function mockInsert(returnRow: unknown) {
    const single = vi.fn().mockResolvedValue({ data: returnRow, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    mockFrom.mockReturnValue({ insert })
    return { insert }
  }

  it('maps a student owner and persists a link', async () => {
    const { insert } = mockInsert(liveDoc)
    await createDocument({
      owner_type: 'student',
      owner_id: 'student-1',
      name: 'Consent form',
      type: 'medical_consent',
      expires_at: null,
      other: null,
      source: 'link',
      external_url: 'https://example.com/c.pdf',
      created_by: 'staff-1',
    })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: 'student-1',
        staff_id: null,
        source: 'link',
        external_url: 'https://example.com/c.pdf',
      }),
    )
    expect(revalidateTag).toHaveBeenCalledWith('documents', 'max')
  })

  it('maps a staff owner and persists an upload storage_key', async () => {
    const { insert } = mockInsert({ ...liveDoc, source: 'upload' })
    await createDocument({
      owner_type: 'staff',
      owner_id: 'staff-2',
      name: 'Contract',
      type: 'contract',
      expires_at: '2030-01-01',
      other: null,
      source: 'upload',
      storage_key: 'staff/staff-2/uuid.pdf',
      file_name: 'c.pdf',
      file_size: 100,
      mime_type: 'application/pdf',
      created_by: 'staff-1',
    })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        staff_id: 'staff-2',
        student_id: null,
        storage_key: 'staff/staff-2/uuid.pdf',
        expires_at: '2030-01-01',
      }),
    )
  })

  it('persists a record with fields JSONB', async () => {
    const fields = [{ field: 'Cert', value: '123' }]
    const { insert } = mockInsert({ ...liveDoc, source: 'record', fields })
    await createDocument({
      owner_type: 'staff',
      owner_id: 'staff-2',
      name: 'DBS',
      type: 'dbs_check',
      expires_at: null,
      other: null,
      source: 'record',
      fields,
      created_by: 'staff-1',
    })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'record', fields }),
    )
  })

  it('throws and does not revalidate on error', async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('insert failed') })
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single }),
      }),
    })
    await expect(
      createDocument({
        owner_type: 'student',
        owner_id: 'student-1',
        name: 'x',
        type: 'other',
        expires_at: null,
        other: null,
        source: 'link',
        external_url: 'https://x',
        created_by: 'staff-1',
      }),
    ).rejects.toThrow('insert failed')
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe('updateDocument', () => {
  it('updates the envelope and includes fields for records', async () => {
    const single = vi.fn().mockResolvedValue({ data: liveDoc, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockFrom.mockReturnValue({ update })

    const fields = [{ field: 'Cert', value: '999' }]
    await updateDocument('doc-1', {
      name: 'Updated',
      type: 'dbs_check',
      expires_at: null,
      other: 'note',
      fields,
      updated_by: 'staff-9',
    })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Updated',
        updated_by: 'staff-9',
        fields,
      }),
    )
    expect(revalidateTag).toHaveBeenCalledWith('documents', 'max')
  })

  it('omits fields for file-backed rows', async () => {
    const single = vi.fn().mockResolvedValue({ data: liveDoc, error: null })
    const update = vi.fn().mockReturnValue({
      eq: vi
        .fn()
        .mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
    })
    mockFrom.mockReturnValue({ update })

    await updateDocument('doc-1', {
      name: 'Renamed',
      type: 'contract',
      expires_at: '2031-01-01',
      other: null,
      updated_by: 'staff-9',
    })
    expect(update).toHaveBeenCalledWith(
      expect.not.objectContaining({ fields: expect.anything() }),
    )
  })
})

describe('softDeleteDocument', () => {
  it('sets deleted_at/deleted_by via UPDATE and revalidates both tags', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    mockFrom.mockReturnValue({ update })

    await softDeleteDocument('doc-1', 'staff-9')

    expect(mockFrom).toHaveBeenCalledWith('documents')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_by: 'staff-9' }),
    )
    expect(update.mock.calls[0][0]).toHaveProperty('deleted_at')
    expect(eq).toHaveBeenCalledWith('id', 'doc-1')
    expect(revalidateTag).toHaveBeenCalledWith('documents', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('documents-deleted', 'max')
  })

  it('throws and does not revalidate on error', async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: new Error('update failed') }),
    })
    mockFrom.mockReturnValue({ update })
    await expect(softDeleteDocument('doc-1', 'staff-9')).rejects.toThrow(
      'update failed',
    )
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
