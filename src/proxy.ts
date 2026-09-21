import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessPath, noAccessPath, publicPaths } from '@/lib/routes'
import type { StaffRole } from '@/types/next-auth'

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth
  const isLoginPage = pathname === '/login'
  const isPublicPath = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )

  if (isPublicPath) return // form, its success page, and the server-action POST to /register

  if (!isLoginPage && !isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (isLoginPage && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  if (isLoggedIn) {
    const role = req.auth?.user?.role as StaffRole | undefined
    const isNoAccessPage = pathname === noAccessPath
    // A session without a role (no matching staff record) can't use any page;
    // sending it to /dashboard would loop, so it gets a dead-end page instead.
    if (!role) {
      if (isNoAccessPage) return
      return NextResponse.redirect(new URL(noAccessPath, req.url))
    }
    if (isNoAccessPage || !canAccessPath(pathname, role)) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }
})

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|icons|manifest.json|sw.js|offline.html|favicon.ico).*)',
  ],
}
