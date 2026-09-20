import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'

import { getActor, requireSession, requireRole } from './require'

vi.mock('server-only', () => ({}))
vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  }),
}))

const mockAuth = vi.mocked(auth)
const mockRedirect = vi.mocked(redirect)

function session(user: Record<string, unknown> | null) {
  return user === null ? null : { user }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getActor', () => {
  it('maps the session user onto an Actor', async () => {
    mockAuth.mockResolvedValue(
      session({
        staffId: 'staff-1',
        role: 'admin',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      }) as never,
    )

    await expect(getActor()).resolves.toEqual({
      staffId: 'staff-1',
      role: 'admin',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    })
  })

  it('defaults a missing name to null and a missing email to an empty string', async () => {
    mockAuth.mockResolvedValue(
      session({ staffId: 'staff-1', role: 'teacher' }) as never,
    )

    await expect(getActor()).resolves.toEqual({
      staffId: 'staff-1',
      role: 'teacher',
      name: null,
      email: '',
    })
  })

  it('returns null when there is no session', async () => {
    mockAuth.mockResolvedValue(null as never)

    await expect(getActor()).resolves.toBeNull()
  })

  it('returns null when the session has no staffId', async () => {
    mockAuth.mockResolvedValue(session({ role: 'admin' }) as never)

    await expect(getActor()).resolves.toBeNull()
  })

  it('does not redirect', async () => {
    mockAuth.mockResolvedValue(null as never)

    await getActor()

    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

describe('requireSession', () => {
  it('returns the actor when there is a session', async () => {
    mockAuth.mockResolvedValue(
      session({
        staffId: 'staff-1',
        role: 'secretary',
        name: 'Grace',
        email: 'grace@example.com',
      }) as never,
    )

    const actor = await requireSession()

    expect(actor.staffId).toBe('staff-1')
    expect(actor.role).toBe('secretary')
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects to /login when there is no session', async () => {
    mockAuth.mockResolvedValue(null as never)

    await expect(requireSession()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to /login when the session has no staffId', async () => {
    mockAuth.mockResolvedValue(session({ role: 'admin' }) as never)

    await expect(requireSession()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })
})

describe('requireRole', () => {
  it('returns the actor when the check passes', async () => {
    mockAuth.mockResolvedValue(
      session({ staffId: 'staff-1', role: 'admin' }) as never,
    )
    const check = vi.fn((role: string) => role === 'admin')

    const actor = await requireRole(check as never)

    expect(actor.role).toBe('admin')
    expect(check).toHaveBeenCalledWith('admin')
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects to /dashboard when the check fails', async () => {
    mockAuth.mockResolvedValue(
      session({ staffId: 'staff-1', role: 'teacher' }) as never,
    )

    await expect(
      requireRole(((role: string) => role === 'admin') as never),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard')
  })

  it('redirects to /login before checking the role when signed out', async () => {
    mockAuth.mockResolvedValue(null as never)
    const check = vi.fn(() => true)

    await expect(requireRole(check as never)).rejects.toThrow(
      'NEXT_REDIRECT:/login',
    )
    expect(check).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })
})
