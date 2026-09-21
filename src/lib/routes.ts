import {
  canAccessAdminTasks,
  canAccessReports,
  canManageFinance,
  canManageHr,
  canReviewRegistrations,
  canViewGuardians,
} from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

export type IconName =
  | 'home'
  | 'chart'
  | 'staff'
  | 'students'
  | 'guardians'
  | 'classes'
  | 'attendance'
  | 'lessonPlans'
  | 'clock'
  | 'incidents'
  | 'inbox'
  | 'hr'
  | 'finance'
  | 'admin'

export type AppRoute = {
  href: `/${string}`
  label: string
  icon: IconName
  /** Omit = any signed-in staff. */
  permission?: (role: StaffRole) => boolean
  /** Show in sidebar. Detail/edit routes are covered by prefix, not listed. */
  nav: boolean
}

export const routes: readonly AppRoute[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'home', nav: true },
  {
    href: '/reports',
    label: 'Reports',
    icon: 'chart',
    permission: canAccessReports,
    nav: true,
  },
  { href: '/staff', label: 'Staff', icon: 'staff', nav: true },
  { href: '/students', label: 'Students', icon: 'students', nav: true },
  {
    href: '/guardians',
    label: 'Guardians',
    icon: 'guardians',
    permission: canViewGuardians,
    nav: true,
  },
  { href: '/classes', label: 'Classes', icon: 'classes', nav: true },
  {
    href: '/attendance',
    label: 'Attendance',
    icon: 'attendance',
    nav: true,
  },
  {
    href: '/lesson-plans',
    label: 'Lesson Plans',
    icon: 'lessonPlans',
    nav: true,
  },
  {
    href: '/staff-attendance',
    label: 'Staff Sign-In',
    icon: 'clock',
    nav: true,
  },
  {
    href: '/incidents',
    label: 'Incidents',
    icon: 'incidents',
    nav: true,
  },
  {
    href: '/registrations',
    label: 'Registrations',
    icon: 'inbox',
    permission: canReviewRegistrations,
    nav: true,
  },
  {
    href: '/hr',
    label: 'HR',
    icon: 'hr',
    permission: canManageHr,
    nav: true,
  },
  {
    href: '/finance',
    label: 'Finance',
    icon: 'finance',
    permission: canManageFinance,
    nav: true,
  },
  {
    href: '/admin',
    label: 'Admin Tasks',
    icon: 'admin',
    permission: canAccessAdminTasks,
    nav: true,
  },
] as const

export const publicPaths: readonly string[] = ['/register']

/** Where signed-in users without a staff role are sent. */
export const noAccessPath = '/no-access'

/** Longest-prefix match: '/finance/students/x' → the '/finance' route. */
export function routeForPath(pathname: string): AppRoute | undefined {
  let match: AppRoute | undefined
  for (const route of routes) {
    if (pathname === route.href || pathname.startsWith(`${route.href}/`)) {
      if (!match || route.href.length > match.href.length) {
        match = route
      }
    }
  }
  return match
}

export function canAccessPath(pathname: string, role: StaffRole): boolean {
  const route = routeForPath(pathname)
  if (!route?.permission) return true
  return route.permission(role)
}
