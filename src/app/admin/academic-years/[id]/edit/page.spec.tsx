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
  notFound: vi.fn().mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/db', () => ({
  getAcademicYearById: vi.fn(),
}))

vi.mock('../../../_tabs/academic-years/AcademicYearForm', () => ({
  default: ({ defaultValues }: { defaultValues: { code: string } }) => (
    <div data-testid="year-form">{defaultValues.code}</div>
  ),
}))

vi.mock('../../actions', () => ({ saveAcademicYearAction: vi.fn() }))

import { auth } from '@/auth'
import { getAcademicYearById } from '@/db'

import EditAcademicYearPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
})

function renderPage(id = 'year-1') {
  return EditAcademicYearPage({ params: Promise.resolve({ id }) })
}

describe('EditAcademicYearPage', () => {
  it('redirects non-admin roles to /admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-1' },
    } as any)

    await expect(renderPage()).rejects.toThrow('NEXT_REDIRECT:/admin')
  })

  it('404s when the year does not exist', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getAcademicYearById).mockResolvedValue(null)

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the form with the year', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getAcademicYearById).mockResolvedValue({
      id: 'year-1',
      code: '2025-26',
      start_date: '2025-09-01',
      end_date: '2026-08-31',
      is_current: false,
    } as any)

    render(await renderPage())

    expect(
      screen.getByRole('heading', { name: 'Edit Academic Year: 2025-26' }),
    ).toBeTruthy()
    expect(screen.getByTestId('year-form').textContent).toBe('2025-26')
  })
})
