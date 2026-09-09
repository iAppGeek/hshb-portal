import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessReports } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

const PUBLIC_PATHS = ['/register']

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth
  const isLoginPage = pathname === '/login'
  const isReportsPage = pathname.startsWith('/reports')
  const isPublicPath = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )

  if (isPublicPath) return // form, its success page, and the server-action POST to /register

  if (!isLoginPage && !isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (isLoginPage && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  if (isReportsPage) {
    const role = req.auth?.user?.role as StaffRole | undefined
    if (!role || !canAccessReports(role)) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }
})

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|icons|manifest.json|sw.js|offline.html|favicon.ico).*)',
  ],
}
