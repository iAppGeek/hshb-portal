import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  getPhotoOptOutById,
  findStudentMatches,
  getStudentsForLinking,
} from '@/db'

import PhotoOptOutDetailPage from './page'

vi.mock('@/auth', () => ({ auth: vi.fn() }))

vi.mock('@/db', () => ({
  getPhotoOptOutById: vi.fn(),
  findStudentMatches: vi.fn(),
  getStudentsForLinking: vi.fn(),
}))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn(),
}))

vi.mock('./PhotoOptOutReview', () => ({
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

const request = {
  id: 'req-1',
  status: 'pending',
  child_first_name: 'Alice',
  child_last_name: 'Student',
  date_of_birth: '2015-06-01',
}

function signInAs(role: string | null): void {
  vi.mocked(auth).mockResolvedValue(
    (role ? { user: { role, staffId: 'staff-1' } } : null) as never,
  )
}

function renderPage(id = 'req-1'): Promise<React.ReactElement> {
  return PhotoOptOutDetailPage({ params: Promise.resolve({ id }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(redirect).mockImplementation(() => {
    throw new Error('NEXT_REDIRECT')
  })
  vi.mocked(findStudentMatches).mockResolvedValue([])
  vi.mocked(getStudentsForLinking).mockResolvedValue([])
})

describe('PhotoOptOutDetailPage', () => {
  it('redirects teacher to dashboard', async () => {
    signInAs('teacher')
    await expect(renderPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('redirects unauthenticated users to the login page', async () => {
    signInAs(null)
    await expect(renderPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('404s for an unknown id', async () => {
    signInAs('secretary')
    vi.mocked(getPhotoOptOutById).mockResolvedValue(null)

    await expect(renderPage('missing')).rejects.toThrow(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    )
  })

  it('fetches student matches and linking candidates for admin on a pending request', async () => {
    signInAs('admin')
    vi.mocked(getPhotoOptOutById).mockResolvedValue(request as never)
    vi.mocked(findStudentMatches).mockResolvedValue([
      { id: 'match-1' },
    ] as never)
    vi.mocked(getStudentsForLinking).mockResolvedValue([
      { id: 'student-1' },
      { id: 'student-2' },
    ] as never)

    render(await renderPage())

    expect(findStudentMatches).toHaveBeenCalledWith({
      firstName: 'Alice',
      lastName: 'Student',
      dateOfBirth: '2015-06-01',
    })
    expect(screen.getByTestId('review').textContent).toBe('matches=1 linking=2')
  })

  it('skips the match lookups for non-admin reviewers', async () => {
    signInAs('secretary')
    vi.mocked(getPhotoOptOutById).mockResolvedValue(request as never)

    render(await renderPage())

    expect(findStudentMatches).not.toHaveBeenCalled()
    expect(getStudentsForLinking).not.toHaveBeenCalled()
  })

  it('skips the match lookups once the request is actioned', async () => {
    signInAs('admin')
    vi.mocked(getPhotoOptOutById).mockResolvedValue({
      ...request,
      status: 'actioned',
    } as never)

    render(await renderPage())

    expect(findStudentMatches).not.toHaveBeenCalled()
    expect(getStudentsForLinking).not.toHaveBeenCalled()
  })

  it('still renders when findStudentMatches rejects', async () => {
    signInAs('admin')
    vi.mocked(getPhotoOptOutById).mockResolvedValue(request as never)
    vi.mocked(findStudentMatches).mockRejectedValue(new Error('rpc failed'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(await renderPage())

    expect(screen.getByTestId('review').textContent).toContain('matches=0')
    consoleSpy.mockRestore()
  })
})
