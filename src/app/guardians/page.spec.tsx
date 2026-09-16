import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/db', () => ({
  getAllGuardians: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('./GuardiansTable', () => ({
  default: ({ guardians }: { guardians: unknown[] }) => (
    <div>GuardiansTable count={guardians.length}</div>
  ),
}))

import { auth } from '@/auth'
import { getAllGuardians } from '@/db'

import GuardiansPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
})

const mockGuardian = {
  id: 'guardian-1',
  first_name: 'Maria',
  last_name: 'Smith',
  phone: '07700 900000',
  email: 'maria@example.com',
  child_count: 2,
}

describe('GuardiansPage', () => {
  it('renders the Guardians heading for admin', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as any)
    vi.mocked(getAllGuardians).mockResolvedValue([])

    render(await GuardiansPage())
    expect(screen.getByText('Guardians')).toBeTruthy()
  })

  it('renders guardian rows in the table', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as any)
    vi.mocked(getAllGuardians).mockResolvedValue([mockGuardian] as any)

    render(await GuardiansPage())
    expect(screen.getByText(/GuardiansTable/)).toBeTruthy()
  })

  it('shows empty state when no guardians exist', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as any)
    vi.mocked(getAllGuardians).mockResolvedValue([])

    render(await GuardiansPage())
    expect(screen.getByText('No guardians found.')).toBeTruthy()
  })

  it.each(['teacher', 'headteacher', 'secretary'] as const)(
    'redirects %s to students list',
    async (role) => {
      vi.mocked(auth).mockResolvedValue({ user: { role } } as any)
      vi.mocked(redirect).mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
      })

      await expect(GuardiansPage()).rejects.toThrow('NEXT_REDIRECT')
      expect(redirect).toHaveBeenCalledWith('/students')
      expect(getAllGuardians).not.toHaveBeenCalled()
    },
  )
})
