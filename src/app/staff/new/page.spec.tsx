import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn().mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('./AddStaffForm', () => ({
  default: () => <div>AddStaffForm</div>,
}))

import { auth } from '@/auth'

import AddStaffPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AddStaffPage', () => {
  it('redirects to /staff for non-admin roles', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'teacher' } } as any)

    await expect(AddStaffPage()).rejects.toThrow('NEXT_REDIRECT:/staff')
  })

  it('redirects to /staff for secretary role', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'secretary' } } as any)

    await expect(AddStaffPage()).rejects.toThrow('NEXT_REDIRECT:/staff')
  })

  it('redirects to /staff when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: undefined } } as any)

    await expect(AddStaffPage()).rejects.toThrow('NEXT_REDIRECT:/staff')
  })

  it('renders heading for admin users', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as any)

    render(await AddStaffPage())
    expect(screen.getByText('Add Staff Member')).toBeTruthy()
  })

  it('renders the AddStaffForm for admin users', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as any)

    render(await AddStaffPage())
    expect(screen.getByText('AddStaffForm')).toBeTruthy()
  })
})
