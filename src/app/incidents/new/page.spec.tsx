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
  getStudentSummaries: vi.fn(),
}))

vi.mock('../IncidentForm', () => ({
  default: ({
    defaultType,
    students,
  }: {
    defaultType: string
    students: { id: string }[]
  }) => (
    <div>{`IncidentForm type=${defaultType} students=${students.length}`}</div>
  ),
}))

vi.mock('../actions', () => ({ saveIncidentAction: vi.fn() }))

import { auth } from '@/auth'
import { getStudentSummaries } from '@/db'

import AddIncidentPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
})

const mockStudent = {
  id: 'student-1',
  first_name: 'Nikos',
  last_name: 'Papadopoulos',
  student_classes: [{ class: { name: 'Year 3' } }],
}

describe('AddIncidentPage', () => {
  it('redirects to /login when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    await expect(
      AddIncidentPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('renders IncidentForm for admin with default medical type', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getStudentSummaries).mockResolvedValue([mockStudent] as any)

    render(await AddIncidentPage({ searchParams: Promise.resolve({}) }))
    expect(
      screen.getByText('IncidentForm type=medical students=1'),
    ).toBeTruthy()
  })

  it('passes behaviour type from searchParams', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getStudentSummaries).mockResolvedValue([])

    render(
      await AddIncidentPage({
        searchParams: Promise.resolve({ type: 'behaviour' }),
      }),
    )
    expect(
      screen.getByText('IncidentForm type=behaviour students=0'),
    ).toBeTruthy()
  })

  it.each(['admin', 'headteacher', 'secretary', 'teacher'])(
    'offers every active student to a %s',
    async (role) => {
      vi.mocked(auth).mockResolvedValue({
        user: { role, staffId: 'staff-3' },
      } as any)
      vi.mocked(getStudentSummaries).mockResolvedValue([mockStudent] as any)

      render(await AddIncidentPage({ searchParams: Promise.resolve({}) }))
      expect(
        screen.getByText('IncidentForm type=medical students=1'),
      ).toBeTruthy()
      expect(getStudentSummaries).toHaveBeenCalled()
    },
  )
})
