import 'server-only'

import { redirect } from 'next/navigation'

import type { StaffRole } from '@/types/next-auth'

import { auth } from './index'

export type Actor = {
  staffId: string
  role: StaffRole
  name: string | null
  email: string
}

/**
 * The actor behind the current request, or null when there is no usable
 * session. Server actions use this because they return an error to the form
 * rather than navigating away.
 */
export async function getActor(): Promise<Actor | null> {
  const session = await auth()
  const user = session?.user
  if (!user?.staffId) return null
  return {
    staffId: user.staffId,
    role: user.role,
    name: user.name ?? null,
    email: user.email ?? '',
  }
}

/** Redirects to /login when there is no session or the session has no staffId. */
export async function requireSession(): Promise<Actor> {
  const actor = await getActor()
  if (!actor) redirect('/login')
  return actor
}

/** requireSession, then redirect('/dashboard') if `check(role)` is false. */
export async function requireRole(
  check: (role: StaffRole) => boolean,
): Promise<Actor> {
  const actor = await requireSession()
  if (!check(actor.role)) redirect('/dashboard')
  return actor
}
