import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/db', () => ({
  getGuardiansWithChildCounts: vi.fn(),
}))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn(),
}))

vi.mock('./GuardiansTable', () => ({
  default: ({ guardians }: { guardians: { child_count: number }[] }) => (
    <div>
      GuardiansTable count={guardians.length} counts=
      {guardians.map((g) => g.child_count).join(',')}
    </div>
  ),
}))

import { auth } from '@/auth'
import { getGuardiansWithChildCounts } from '@/db'

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
  child_count: 3,
}

describe('GuardiansPage', () => {
  it('renders the Guardians heading for admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getGuardiansWithChildCounts).mockResolvedValue([])

    render(await GuardiansPage())
    expect(screen.getByText('Guardians')).toBeTruthy()
  })

  it('renders guardian rows in the table', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getGuardiansWithChildCounts).mockResolvedValue([mockGuardian])

    render(await GuardiansPage())
    expect(screen.getByText(/GuardiansTable/)).toBeTruthy()
  })

  it('passes each guardian’s child count through to the table', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getGuardiansWithChildCounts).mockResolvedValue([mockGuardian])

    render(await GuardiansPage())
    expect(screen.getByText(/counts=3/)).toBeTruthy()
  })

  it('shows empty state when no guardians exist', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getGuardiansWithChildCounts).mockResolvedValue([])

    render(await GuardiansPage())
    expect(screen.getByText('No guardians found.')).toBeTruthy()
  })

  it.each(['teacher', 'headteacher', 'secretary'] as const)(
    'redirects %s to students list',
    async (role) => {
      vi.mocked(auth).mockResolvedValue({
        user: { role, staffId: 'staff-1' },
      } as any)
      vi.mocked(redirect).mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
      })

      await expect(GuardiansPage()).rejects.toThrow('NEXT_REDIRECT')
      expect(redirect).toHaveBeenCalledWith('/students')
      expect(getGuardiansWithChildCounts).not.toHaveBeenCalled()
    },
  )
})
