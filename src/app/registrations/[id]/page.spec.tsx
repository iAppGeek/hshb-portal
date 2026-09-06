import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  getRegistrationSubmissionById,
  findStudentMatches,
  getStudentsForLinking,
  getAllClasses,
} from '@/db'

import RegistrationDetailPage from './page'

vi.mock('@/auth', () => ({ auth: vi.fn() }))

vi.mock('@/db', () => ({
  getRegistrationSubmissionById: vi.fn(),
  findStudentMatches: vi.fn(),
  getStudentsForLinking: vi.fn(),
  getAllClasses: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

vi.mock('./RegistrationReview', () => ({
  default: ({
    matches,
    studentsForLinking,
  }: {
    matches: unknown[]
    studentsForLinking: unknown[]
  }) => (
    <div data-testid="review">
      matches={matches.length} linking={studentsForLinking.length}
    </div>
  ),
}))

const submission = {
  id: 'sub-1',
  child_first_name: 'Seed',
  child_last_name: 'Pending',
  date_of_birth: '2020-01-15',
  contacts: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RegistrationDetailPage', () => {
  it('redirects teacher to dashboard', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'teacher' },
    } as never)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      RegistrationDetailPage({ params: Promise.resolve({ id: 'sub-1' }) }),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('redirects unauthenticated users to dashboard', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      RegistrationDetailPage({ params: Promise.resolve({ id: 'sub-1' }) }),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('redirects to the list when the submission is not found', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'secretary' },
    } as never)
    vi.mocked(getRegistrationSubmissionById).mockResolvedValue(null)
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(
      RegistrationDetailPage({ params: Promise.resolve({ id: 'missing' }) }),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/registrations')
  })

  it('fetches student matches, linking candidates and classes for admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'admin' },
    } as never)
    vi.mocked(getRegistrationSubmissionById).mockResolvedValue(
      submission as never,
    )
    vi.mocked(findStudentMatches).mockResolvedValue([
      { id: 'match-1' },
    ] as never)
    vi.mocked(getStudentsForLinking).mockResolvedValue([
      { id: 'student-1' },
    ] as never)
    vi.mocked(getAllClasses).mockResolvedValue([])

    render(
      await RegistrationDetailPage({
        params: Promise.resolve({ id: 'sub-1' }),
      }),
    )

    expect(findStudentMatches).toHaveBeenCalledWith({
      firstName: 'Seed',
      lastName: 'Pending',
      dateOfBirth: '2020-01-15',
    })
    expect(screen.getByTestId('review').textContent).toBe('matches=1 linking=1')
  })

  it('does not fetch matches or linking candidates for non-admin reviewers', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { role: 'secretary' },
    } as never)
    vi.mocked(getRegistrationSubmissionById).mockResolvedValue(
      submission as never,
    )

    render(
      await RegistrationDetailPage({
        params: Promise.resolve({ id: 'sub-1' }),
      }),
    )

    expect(findStudentMatches).not.toHaveBeenCalled()
    expect(getStudentsForLinking).not.toHaveBeenCalled()
    expect(getAllClasses).not.toHaveBeenCalled()
    expect(screen.getByTestId('review').textContent).toBe('matches=0 linking=0')
  })
})
