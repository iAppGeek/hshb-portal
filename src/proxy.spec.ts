import { describe, it, expect, vi, beforeEach } from 'vitest'

import { routes } from '@/lib/routes'
import type { StaffRole } from '@/types/next-auth'

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: URL) => ({ redirected: true, url })),
)

vi.mock('@/auth', () => ({
  auth: vi.fn((handler: any) => handler),
}))

vi.mock('next/server', () => ({
  NextResponse: { redirect: mockRedirect },
}))

import { proxy as middleware } from './proxy'

const makeReq = (pathname: string, auth: any = null) =>
  [
    {
      nextUrl: { pathname },
      url: 'http://localhost:3000',
      auth,
    } as any,
    {} as any,
  ] as const

const ALL_ROLES: StaffRole[] = ['admin', 'headteacher', 'secretary', 'teacher']

beforeEach(() => {
  vi.clearAllMocks()
})

describe('middleware', () => {
  it('redirects unauthenticated user to login', () => {
    middleware(...makeReq('/dashboard'))
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/login', 'http://localhost:3000'),
    )
  })

  it('redirects logged-in user away from login page to dashboard', () => {
    middleware(...makeReq('/login', { user: { role: 'teacher' } }))
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/dashboard', 'http://localhost:3000'),
    )
  })

  it('allows authenticated user to access dashboard', () => {
    middleware(...makeReq('/dashboard', { user: { role: 'admin' } }))
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('allows unauthenticated access to /register', () => {
    middleware(...makeReq('/register'))
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('allows unauthenticated access to /register/success', () => {
    middleware(...makeReq('/register/success'))
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('allows authenticated access to /register', () => {
    middleware(...makeReq('/register', { user: { role: 'admin' } }))
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects unauthenticated user away from /registrations (exact-prefix check)', () => {
    middleware(...makeReq('/registrations'))
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/login', 'http://localhost:3000'),
    )
  })

  it('sends a signed-in user with no role to /no-access', () => {
    middleware(...makeReq('/dashboard', { user: {} }))
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/no-access', 'http://localhost:3000'),
    )
  })

  it('lets a signed-in user with no role stay on /no-access (no loop)', () => {
    middleware(...makeReq('/no-access', { user: {} }))
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects unauthenticated user away from /no-access to login', () => {
    middleware(...makeReq('/no-access'))
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/login', 'http://localhost:3000'),
    )
  })

  it.each(ALL_ROLES)(
    'redirects %s away from /no-access to dashboard',
    (role) => {
      middleware(...makeReq('/no-access', { user: { role } }))
      expect(mockRedirect).toHaveBeenCalledWith(
        new URL('/dashboard', 'http://localhost:3000'),
      )
    },
  )

  for (const route of routes.filter((r) => r.permission)) {
    const allowedRoles = ALL_ROLES.filter((role) => route.permission!(role))
    const deniedRoles = ALL_ROLES.filter((role) => !route.permission!(role))

    it.each(deniedRoles)(
      `redirects %s away from ${route.href} to dashboard`,
      (role) => {
        middleware(...makeReq(route.href, { user: { role } }))
        expect(mockRedirect).toHaveBeenCalledWith(
          new URL('/dashboard', 'http://localhost:3000'),
        )
      },
    )

    it.each(allowedRoles)(`allows %s to access ${route.href}`, (role) => {
      middleware(...makeReq(route.href, { user: { role } }))
      expect(mockRedirect).not.toHaveBeenCalled()
    })

    it(`allows access to a nested path under ${route.href} for an allowed role`, () => {
      const role = allowedRoles[0]
      if (!role) return
      middleware(...makeReq(`${route.href}/nested/id`, { user: { role } }))
      expect(mockRedirect).not.toHaveBeenCalled()
    })

    it(`does not treat ${route.href}X as the same route`, () => {
      const role = deniedRoles[0]
      if (!role) return
      middleware(...makeReq(`${route.href}X`, { user: { role } }))
      expect(mockRedirect).not.toHaveBeenCalled()
    })
  }
})
