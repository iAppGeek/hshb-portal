import { describe, it, expect, vi, beforeEach } from 'vitest'

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

  it('blocks teacher from accessing reports and redirects to dashboard', () => {
    middleware(...makeReq('/reports', { user: { role: 'teacher' } }))
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/dashboard', 'http://localhost:3000'),
    )
  })

  it('allows admin to access reports', () => {
    middleware(...makeReq('/reports', { user: { role: 'admin' } }))
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('allows headteacher to access reports', () => {
    middleware(...makeReq('/reports', { user: { role: 'headteacher' } }))
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it.each(['headteacher', 'secretary', 'teacher'])(
    'redirects %s away from /finance to dashboard',
    (role) => {
      middleware(...makeReq('/finance', { user: { role } }))
      expect(mockRedirect).toHaveBeenCalledWith(
        new URL('/dashboard', 'http://localhost:3000'),
      )
    },
  )

  it('redirects non-admin away from nested /finance pages', () => {
    middleware(
      ...makeReq('/finance/staff/abc', { user: { role: 'headteacher' } }),
    )
    expect(mockRedirect).toHaveBeenCalledWith(
      new URL('/dashboard', 'http://localhost:3000'),
    )
  })

  it('allows admin to access /finance and nested pages', () => {
    middleware(...makeReq('/finance', { user: { role: 'admin' } }))
    middleware(
      ...makeReq('/finance/fee-plans/new', { user: { role: 'admin' } }),
    )
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('does not treat /financeX as a finance page', () => {
    middleware(...makeReq('/financeX', { user: { role: 'teacher' } }))
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
})
