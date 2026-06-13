import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/db', () => ({ getDeletedDocuments: vi.fn() }))

import { auth } from '@/auth'
import { getDeletedDocuments } from '@/db'

import DeletedDocumentsPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({
    user: { role: 'admin', staffId: 'admin-1' },
  } as never)
  vi.mocked(getDeletedDocuments).mockResolvedValue([])
})

describe('DeletedDocumentsPage', () => {
  it('redirects non-admin roles to dashboard', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 't' },
    } as never)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })
    await expect(DeletedDocumentsPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('shows an empty state when there are no deleted documents', async () => {
    render(await DeletedDocumentsPage())
    expect(screen.getByText('No deleted documents.')).toBeTruthy()
  })

  it('renders deleted rows with owner, deleter and a View link for files', async () => {
    vi.mocked(getDeletedDocuments).mockResolvedValue([
      {
        id: 'doc-1',
        student_id: 'stu-1',
        staff_id: null,
        name: 'Consent form',
        type: 'medical_consent',
        expires_at: null,
        source: 'link',
        external_url: 'https://x',
        fields: null,
        deleted_at: '2026-02-01T09:00:00Z',
        deleted_by: 'admin-1',
        student: { id: 'stu-1', first_name: 'Alice', last_name: 'Student' },
        staff: null,
        deleter: { id: 'admin-1', first_name: 'Alice', last_name: 'Admin' },
      },
    ] as never)

    render(await DeletedDocumentsPage())

    expect(screen.getByText('Consent form')).toBeTruthy()
    expect(screen.getByText('Student, Alice')).toBeTruthy()
    expect(screen.getByText(/by Alice Admin/)).toBeTruthy()
    const view = screen.getByText('View').closest('a')
    expect(view?.getAttribute('href')).toBe('/api/documents/doc-1/download')
  })

  it('renders record fields inline and no View link for records', async () => {
    vi.mocked(getDeletedDocuments).mockResolvedValue([
      {
        id: 'doc-2',
        student_id: null,
        staff_id: 'staff-2',
        name: 'DBS',
        type: 'dbs_check',
        expires_at: null,
        source: 'record',
        external_url: null,
        fields: [{ field: 'Status', value: 'Clear' }],
        deleted_at: '2026-02-01T09:00:00Z',
        deleted_by: 'admin-1',
        student: null,
        staff: { id: 'staff-2', first_name: 'Tom', last_name: 'Teacher' },
        deleter: { id: 'admin-1', first_name: 'Alice', last_name: 'Admin' },
      },
    ] as never)

    render(await DeletedDocumentsPage())

    expect(screen.getByText('Status:')).toBeTruthy()
    expect(screen.queryByText('View')).toBeNull()
  })
})
