import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  getRegistrationSubmissions,
  getPhotoOptOuts,
  getPendingPhotoOptOutCount,
} from '@/db'

import RegistrationsPage from './page'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/db', () => ({
  getRegistrationSubmissions: vi.fn(),
  getPhotoOptOuts: vi.fn(),
  getPendingPhotoOptOutCount: vi.fn(),
}))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn(),
}))

vi.mock('./RegistrationsTable', () => ({
  default: ({ registrations }: { registrations: unknown[] }) => (
    <div>RegistrationsTable count={registrations.length}</div>
  ),
}))

vi.mock('./PhotoOptOutsTable', () => ({
  default: ({ requests }: { requests: unknown[] }) => (
    <div>PhotoOptOutsTable count={requests.length}</div>
  ),
}))

vi.mock('./ShareLinksBar', () => ({
  default: () => <div data-testid="share-links" />,
}))

function signInAs(role: string): void {
  vi.mocked(auth).mockResolvedValue({
    user: { role, staffId: 'staff-1' },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getRegistrationSubmissions).mockResolvedValue([])
  vi.mocked(getPhotoOptOuts).mockResolvedValue([])
  vi.mocked(getPendingPhotoOptOutCount).mockResolvedValue(0)
})

describe('RegistrationsPage', () => {
  it('redirects teacher to dashboard', async () => {
    signInAs('teacher')
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      RegistrationsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('redirects unauthenticated users to the login page', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      RegistrationsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('defaults to pending registrations and shows the share links bar', async () => {
    signInAs('admin')

    render(await RegistrationsPage({ searchParams: Promise.resolve({}) }))

    expect(getRegistrationSubmissions).toHaveBeenCalledWith('pending')
    expect(getPhotoOptOuts).not.toHaveBeenCalled()
    expect(
      screen.getByRole('link', { name: 'To-do' }).getAttribute('aria-current'),
    ).toBe('page')
    expect(screen.getByTestId('share-links')).toBeTruthy()
  })

  it('renders five tabs, the last linking to photo opt-outs', async () => {
    signInAs('admin')

    render(await RegistrationsPage({ searchParams: Promise.resolve({}) }))

    const nav = screen.getByRole('navigation', { name: 'Registrations' })
    const links = nav.querySelectorAll('a')
    expect(Array.from(links).map((a) => a.textContent)).toEqual([
      'To-do',
      'Actioned',
      'Rejected',
      'All',
      'Photo opt-outs',
    ])
    expect(links[4].getAttribute('href')).toBe(
      '/registrations?tab=photo-opt-outs',
    )
  })

  it('shows the pending opt-out count on the opt-outs tab', async () => {
    signInAs('secretary')
    vi.mocked(getPendingPhotoOptOutCount).mockResolvedValue(2)

    render(await RegistrationsPage({ searchParams: Promise.resolve({}) }))

    const tab = screen.getByRole('link', { name: /Photo opt-outs/ })
    expect(tab.textContent).toContain('2')
  })

  it('passes the requested status through and renders rows', async () => {
    signInAs('secretary')
    vi.mocked(getRegistrationSubmissions).mockResolvedValue([
      { id: 'sub-1' },
    ] as never)

    render(
      await RegistrationsPage({
        searchParams: Promise.resolve({ status: 'rejected' }),
      }),
    )

    expect(getRegistrationSubmissions).toHaveBeenCalledWith('rejected')
    expect(screen.getByText('RegistrationsTable count=1')).toBeTruthy()
  })

  it('shows an empty state when there are no registrations', async () => {
    signInAs('headteacher')

    render(await RegistrationsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('No registrations found.')).toBeTruthy()
  })

  it('falls back to pending when the status param is invalid', async () => {
    signInAs('admin')

    render(
      await RegistrationsPage({
        searchParams: Promise.resolve({ status: 'nonsense' }),
      }),
    )

    expect(getRegistrationSubmissions).toHaveBeenCalledWith('pending')
  })

  describe('photo opt-outs tab', () => {
    it('lists pending opt-outs by default in the opt-outs table', async () => {
      signInAs('admin')
      vi.mocked(getPhotoOptOuts).mockResolvedValue([{ id: 'opt-1' }] as never)

      render(
        await RegistrationsPage({
          searchParams: Promise.resolve({ tab: 'photo-opt-outs' }),
        }),
      )

      expect(getPhotoOptOuts).toHaveBeenCalledWith('pending')
      expect(getRegistrationSubmissions).not.toHaveBeenCalled()
      expect(screen.getByText('PhotoOptOutsTable count=1')).toBeTruthy()
      expect(
        screen
          .getByRole('link', { name: 'Photo opt-outs' })
          .getAttribute('aria-current'),
      ).toBe('page')
    })

    it('filters by status with a second tab bar scoped to opt-outs', async () => {
      signInAs('admin')

      render(
        await RegistrationsPage({
          searchParams: Promise.resolve({
            tab: 'photo-opt-outs',
            status: 'actioned',
          }),
        }),
      )

      expect(getPhotoOptOuts).toHaveBeenCalledWith('actioned')
      const statusNav = screen.getByRole('navigation', {
        name: 'Photo opt-out status',
      })
      const actioned = Array.from(statusNav.querySelectorAll('a')).find(
        (a) => a.textContent === 'Actioned',
      )
      expect(actioned?.getAttribute('href')).toBe(
        '/registrations?tab=photo-opt-outs&status=actioned',
      )
      expect(actioned?.getAttribute('aria-current')).toBe('page')
    })

    it('renders the opt-outs table even when there are none', async () => {
      signInAs('admin')

      render(
        await RegistrationsPage({
          searchParams: Promise.resolve({ tab: 'photo-opt-outs' }),
        }),
      )

      expect(screen.getByText('PhotoOptOutsTable count=0')).toBeTruthy()
      expect(screen.queryByText('No registrations found.')).toBeNull()
    })
  })
})
