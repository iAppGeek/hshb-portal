import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'

import NoAccessPage from './page'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn(),
}))

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}))

vi.mock('@/images/logo.png', () => ({ default: '/logo.png' }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NoAccessPage', () => {
  it('tells a role-less user to contact an admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: 'new@test.com' },
    } as never)

    render(await NoAccessPage())

    expect(screen.getByRole('heading', { name: 'No access' })).toBeTruthy()
    expect(screen.getByText(/contact the admin team/i)).toBeTruthy()
    expect(screen.getByText(/new@test\.com/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('redirects to login when signed out', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(NoAccessPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to dashboard when the user has a role', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: 'admin@test.com', role: 'admin' },
    } as never)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(NoAccessPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })
})
