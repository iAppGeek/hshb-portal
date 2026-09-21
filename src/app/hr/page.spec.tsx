import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'

import HrPage from './page'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))
vi.mock('./_components/StaffPayrollList', () => ({
  default: () => <div data-testid="staff-payroll-list" />,
}))

function mockRole(role: string | null): void {
  vi.mocked(auth).mockResolvedValue(
    (role ? { user: { role, staffId: 'staff-1' } } : null) as never,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('HrPage', () => {
  it('redirects a signed-out visitor to the login page', async () => {
    mockRole(null)
    await expect(HrPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it.each(['headteacher', 'secretary', 'teacher'])(
    'redirects %s to the dashboard',
    async (role) => {
      mockRole(role)
      await expect(HrPage()).rejects.toThrow('NEXT_REDIRECT')
      expect(redirect).toHaveBeenCalledWith('/dashboard')
    },
  )

  it('shows the staff payroll list to admins', async () => {
    mockRole('admin')
    render(await HrPage())

    expect(screen.getByRole('heading', { name: 'HR' })).toBeTruthy()
    expect(screen.getByTestId('staff-payroll-list')).toBeTruthy()
  })
})
