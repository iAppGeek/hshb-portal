import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  getRegistrationSubmissions,
  getPhotoOptOuts,
  getStudentsForLinking,
  findStudentMatches,
} from '@/db'

import RegistrationsPage from './page'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/db', () => ({
  getRegistrationSubmissions: vi.fn(),
  getPhotoOptOuts: vi.fn(),
  getStudentsForLinking: vi.fn(),
  findStudentMatches: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('./RegistrationTabs', () => ({
  default: ({ currentStatus }: { currentStatus: string }) => (
    <div data-testid="tabs">{currentStatus}</div>
  ),
}))

vi.mock('./RegistrationsTable', () => ({
  default: ({ registrations }: { registrations: unknown[] }) => (
    <div>RegistrationsTable count={registrations.length}</div>
  ),
}))

vi.mock('./ShareLinksBar', () => ({
  default: () => <div data-testid="share-links" />,
}))

vi.mock('./PhotoOptOutSection', () => ({
  default: ({ requests }: { requests: unknown[] }) => (
    <div>PhotoOptOutSection count={requests.length}</div>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPhotoOptOuts).mockResolvedValue([])
  vi.mocked(getStudentsForLinking).mockResolvedValue([])
  vi.mocked(findStudentMatches).mockResolvedValue([])
})

describe('RegistrationsPage', () => {
  it('redirects teacher to dashboard', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher', staffId: 'staff-2' },
    } as never)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      RegistrationsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('redirects unauthenticated users to dashboard', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      RegistrationsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('defaults to the pending status for admin and shows the share links bar', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as never)
    vi.mocked(getRegistrationSubmissions).mockResolvedValue([])

    render(await RegistrationsPage({ searchParams: Promise.resolve({}) }))

    expect(getRegistrationSubmissions).toHaveBeenCalledWith('pending')
    expect(screen.getByTestId('tabs').textContent).toBe('pending')
    expect(screen.getByTestId('share-links')).toBeTruthy()
  })

  it('passes the requested status through and renders rows', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'secretary', staffId: 'staff-5' },
    } as never)
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
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'headteacher', staffId: 'staff-4' },
    } as never)
    vi.mocked(getRegistrationSubmissions).mockResolvedValue([])

    render(await RegistrationsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('No registrations found.')).toBeTruthy()
  })

  it('fetches student-matching data for admin but not for secretary', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as never)
    vi.mocked(getRegistrationSubmissions).mockResolvedValue([])
    vi.mocked(getPhotoOptOuts).mockResolvedValue([
      {
        id: 'opt-1',
        status: 'pending',
        child_first_name: 'Alice',
        child_last_name: 'Student',
        date_of_birth: '2015-06-01',
      },
    ] as never)

    render(await RegistrationsPage({ searchParams: Promise.resolve({}) }))

    expect(getStudentsForLinking).toHaveBeenCalled()
    expect(findStudentMatches).toHaveBeenCalledWith({
      firstName: 'Alice',
      lastName: 'Student',
      dateOfBirth: '2015-06-01',
    })
  })

  it('does not fetch student-matching data for secretary', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'secretary', staffId: 'staff-5' },
    } as never)
    vi.mocked(getRegistrationSubmissions).mockResolvedValue([])
    vi.mocked(getPhotoOptOuts).mockResolvedValue([
      {
        id: 'opt-1',
        status: 'pending',
        child_first_name: 'Alice',
        child_last_name: 'Student',
        date_of_birth: '2015-06-01',
      },
    ] as never)

    render(await RegistrationsPage({ searchParams: Promise.resolve({}) }))

    expect(getStudentsForLinking).not.toHaveBeenCalled()
    expect(findStudentMatches).not.toHaveBeenCalled()
  })

  it('falls back to pending when the status param is invalid', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as never)
    vi.mocked(getRegistrationSubmissions).mockResolvedValue([])

    render(
      await RegistrationsPage({
        searchParams: Promise.resolve({ status: 'nonsense' }),
      }),
    )

    expect(getRegistrationSubmissions).toHaveBeenCalledWith('pending')
  })

  it('still renders when findStudentMatches rejects', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin', staffId: 'staff-1' },
    } as never)
    vi.mocked(getRegistrationSubmissions).mockResolvedValue([])
    vi.mocked(getPhotoOptOuts).mockResolvedValue([
      {
        id: 'opt-1',
        status: 'pending',
        child_first_name: 'Alice',
        child_last_name: 'Student',
        date_of_birth: '2015-06-01',
      },
    ] as never)
    vi.mocked(findStudentMatches).mockRejectedValue(new Error('rpc failed'))

    render(await RegistrationsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('PhotoOptOutSection count=1')).toBeTruthy()
  })
})
