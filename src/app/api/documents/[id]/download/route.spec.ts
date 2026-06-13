import { describe, it, expect, vi, beforeEach } from 'vitest'

import { auth } from '@/auth'
import { getDocumentById, logAuditEvent } from '@/db'
import { getFileStorage } from '@/lib/storage'

import { GET } from './route'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/db', () => ({
  getDocumentById: vi.fn(),
  logAuditEvent: vi.fn(),
}))
vi.mock('@/lib/storage', () => ({ getFileStorage: vi.fn() }))

const storage = { getDownloadUrl: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({
    user: { staffId: 'admin-1', role: 'admin' },
  } as never)
  vi.mocked(getFileStorage).mockReturnValue(storage as never)
  storage.getDownloadUrl.mockResolvedValue('https://dl.example/file')
})

function call(id = 'doc-1'): Promise<Response> {
  return GET(new Request('http://localhost/api/documents/doc-1/download'), {
    params: Promise.resolve({ id }),
  })
}

describe('GET /api/documents/[id]/download', () => {
  it('returns 403 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect((await call()).status).toBe(403)
  })

  it('returns 403 for a role without view permission', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { staffId: 't', role: 'teacher' },
    } as never)
    expect((await call()).status).toBe(403)
  })

  it('returns 404 when the document is missing', async () => {
    vi.mocked(getDocumentById).mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })

  it('redirects an upload to the presigned download URL', async () => {
    vi.mocked(getDocumentById).mockResolvedValue({
      id: 'doc-1',
      source: 'upload',
      storage_key: 'student/x/u.pdf',
    } as never)
    const res = await call()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://dl.example/file')
  })

  it('redirects a link to its external URL', async () => {
    vi.mocked(getDocumentById).mockResolvedValue({
      id: 'doc-1',
      source: 'link',
      external_url: 'https://example.com/a.pdf',
    } as never)
    const res = await call()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://example.com/a.pdf')
  })

  it('returns 400 for a record (no file)', async () => {
    vi.mocked(getDocumentById).mockResolvedValue({
      id: 'doc-1',
      source: 'record',
    } as never)
    expect((await call()).status).toBe(400)
  })

  it('still resolves a soft-deleted upload and logs a view audit', async () => {
    vi.mocked(getDocumentById).mockResolvedValue({
      id: 'doc-1',
      source: 'upload',
      storage_key: 'student/x/u.pdf',
      deleted_at: '2026-02-01T00:00:00Z',
    } as never)
    const res = await call()
    expect(res.status).toBe(302)
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'view', entity: 'document' }),
    )
  })
})
