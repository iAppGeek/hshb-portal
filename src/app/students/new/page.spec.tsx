import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getAllGuardians, getNextStudentCode } from '@/db'

import AddStudentPage from './page'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/db', () => ({
  getAllGuardians: vi.fn(),
  getNextStudentCode: vi.fn(),
}))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn(),
}))

vi.mock('../StudentForm', () => ({
  default: ({
    submitLabel,
    suggestedCode,
  }: {
    submitLabel: string
    suggestedCode?: string
  }) => (
    <div data-testid="student-form" data-code={suggestedCode}>
      {submitLabel}
    </div>
  ),
}))

vi.mock('../actions', () => ({ saveStudentAction: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getNextStudentCode).mockResolvedValue('GK-1006')
})

describe('AddStudentPage', () => {
  it('renders the Add Student heading for admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getAllGuardians).mockResolvedValue([])

    render(await AddStudentPage())
    expect(screen.getByText('Add Student')).toBeTruthy()
  })

  it('renders the StudentForm for admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getAllGuardians).mockResolvedValue([])

    render(await AddStudentPage())
    expect(screen.getByTestId('student-form').textContent).toBe('Save student')
  })

  it('suggests the next student code', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getAllGuardians).mockResolvedValue([])

    render(await AddStudentPage())
    expect(screen.getByTestId('student-form').dataset.code).toBe('GK-1006')
  })

  it('redirects teacher to students list', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-2' },
    } as any)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(AddStudentPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/students')
  })

  it('redirects headteacher to students list', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'headteacher', staffId: 'staff-3' },
    } as any)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(AddStudentPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/students')
  })

  it('redirects secretary to students list', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'secretary', staffId: 'staff-4' },
    } as any)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(AddStudentPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/students')
  })
})
