import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/db', () => ({
  getAllGuardians: vi.fn(),
  getGuardianChildCounts: vi.fn(),
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
import { getAllGuardians, getGuardianChildCounts } from '@/db'

import GuardiansPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getGuardianChildCounts).mockResolvedValue(new Map())
})

const mockGuardian = {
  id: 'guardian-1',
  first_name: 'Maria',
  last_name: 'Smith',
  phone: '07700 900000',
  email: 'maria@example.com',
}

describe('GuardiansPage', () => {
  it('renders the Guardians heading for admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getAllGuardians).mockResolvedValue([])

    render(await GuardiansPage())
    expect(screen.getByText('Guardians')).toBeTruthy()
  })

  it('renders guardian rows in the table', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getAllGuardians).mockResolvedValue([mockGuardian] as any)

    render(await GuardiansPage())
    expect(screen.getByText(/GuardiansTable/)).toBeTruthy()
  })

  it('merges in each guardian’s child count from getGuardianChildCounts', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getAllGuardians).mockResolvedValue([mockGuardian] as any)
    vi.mocked(getGuardianChildCounts).mockResolvedValue(
      new Map([['guardian-1', 3]]),
    )

    render(await GuardiansPage())
    expect(screen.getByText(/counts=3/)).toBeTruthy()
  })

  it('gives a guardian with no entry in the counts map a zero count', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getAllGuardians).mockResolvedValue([mockGuardian] as any)
    vi.mocked(getGuardianChildCounts).mockResolvedValue(new Map())

    render(await GuardiansPage())
    expect(screen.getByText(/counts=0/)).toBeTruthy()
  })

  it('shows empty state when no guardians exist', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as any)
    vi.mocked(getAllGuardians).mockResolvedValue([])

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
      expect(getAllGuardians).not.toHaveBeenCalled()
      expect(getGuardianChildCounts).not.toHaveBeenCalled()
    },
  )
})
