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
  getAcademicYears: vi.fn(),
}))

vi.mock('../../_tabs/academic-years/AcademicYearForm', () => ({
  default: ({ defaultValues }: { defaultValues: { code: string } }) => (
    <div data-testid="year-form">{defaultValues.code}</div>
  ),
}))

vi.mock('../actions', () => ({ saveAcademicYearAction: vi.fn() }))

import { auth } from '@/auth'
import { getAcademicYears } from '@/db'

import NewAcademicYearPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NewAcademicYearPage', () => {
  it('redirects non-admin roles to /admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-1' },
    } as any)

    await expect(NewAcademicYearPage()).rejects.toThrow('NEXT_REDIRECT:/admin')
  })

  it('suggests the next code after the latest year', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getAcademicYears).mockResolvedValue([
      {
        id: 'year-1',
        code: '2026-27',
        start_date: '2026-09-01',
        end_date: '2027-08-31',
        is_current: true,
      },
    ] as any)

    render(await NewAcademicYearPage())

    expect(screen.getByTestId('year-form').textContent).toBe('2027-28')
  })

  it('suggests an empty code when there are no years yet', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getAcademicYears).mockResolvedValue([])

    render(await NewAcademicYearPage())

    expect(screen.getByTestId('year-form').textContent).toBe('')
  })
})
