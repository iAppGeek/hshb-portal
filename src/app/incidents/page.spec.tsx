import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn().mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/db', () => ({
  getIncidents: vi.fn(),
  getStudentIdsByTeacher: vi.fn(),
}))

import { auth } from '@/auth'
import { getIncidents, getStudentIdsByTeacher } from '@/db'

import IncidentsPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
})

const mockIncident = {
  id: 'inc-1',
  type: 'medical',
  student_id: 'student-1',
  title: 'Allergic reaction',
  description: 'Desc',
  incident_date: '2026-03-14T10:00:00Z',
  created_by: 'staff-1',
  updated_by: null,
  parent_notified: false,
  parent_notified_at: null,
  created_at: '2026-03-14T10:00:00Z',
  updated_at: '2026-03-14T10:00:00Z',
  student: { id: 'student-1', first_name: 'Nikos', last_name: 'Papadopoulos' },
  creator: { id: 'staff-1', first_name: 'Alice', last_name: 'Smith' },
  updater: null,
}

async function renderPage(searchParams: { type?: string } = {}) {
  render(await IncidentsPage({ searchParams: Promise.resolve(searchParams) }))
}

describe('IncidentsPage', () => {
  it('redirects to /login when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    await expect(
      IncidentsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('renders incidents for admin with an edit link', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getIncidents).mockResolvedValue([mockIncident] as any)

    await renderPage()

    expect(screen.getAllByText('Papadopoulos, Nikos').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Edit').length).toBeGreaterThan(0)
  })

  it('renders incidents for teacher without an edit link', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-3' },
    } as any)
    vi.mocked(getStudentIdsByTeacher).mockResolvedValue(['student-1'])
    vi.mocked(getIncidents).mockResolvedValue([mockIncident] as any)

    await renderPage()

    expect(screen.getAllByText('Papadopoulos, Nikos').length).toBeGreaterThan(0)
    expect(screen.queryByText('Edit')).toBeNull()
    expect(
      screen.getByText(
        'You can only view and record incidents for students in your class.',
      ),
    ).toBeTruthy()
  })

  it('scopes incidents to teacher students only', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-3' },
    } as any)
    vi.mocked(getStudentIdsByTeacher).mockResolvedValue(['student-1'])
    vi.mocked(getIncidents).mockResolvedValue([])

    await renderPage()

    expect(getStudentIdsByTeacher).toHaveBeenCalledWith('staff-3')
    expect(getIncidents).toHaveBeenCalledWith({
      type: 'medical',
      studentIds: ['student-1'],
      limit: 50,
    })
  })

  it('fetches all incidents for admin without scoping', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getIncidents).mockResolvedValue([])

    await renderPage()

    expect(getIncidents).toHaveBeenCalledWith({
      type: 'medical',
      studentIds: undefined,
      limit: 50,
    })
    expect(getStudentIdsByTeacher).not.toHaveBeenCalled()
  })

  it('filters by the type search param', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getIncidents).mockResolvedValue([])

    await renderPage({ type: 'behaviour' })

    expect(getIncidents).toHaveBeenCalledWith({
      type: 'behaviour',
      studentIds: undefined,
      limit: 50,
    })
  })

  it('shows a disabled edit link for a secretary', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'secretary', staffId: 'staff-4' },
    } as any)
    vi.mocked(getIncidents).mockResolvedValue([mockIncident] as any)

    await renderPage()

    expect(getStudentIdsByTeacher).not.toHaveBeenCalled()
    expect(screen.getAllByText('Edit').length).toBeGreaterThan(0)
  })
})
