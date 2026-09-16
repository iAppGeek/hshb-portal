import { test, expect } from '../../fixtures/index'

type Role = 'admin' | 'headteacher' | 'teacher' | 'secretary'

type RouteRule = {
  route: string
  allowedRoles: Role[]
  redirectTo: string
}

// Guardian seed ID from supabase/seed.sql
const GUARDIAN_ID = '20000000-0000-0000-0000-000000000001'
// Pending registration submission seed ID from supabase/seed.sql
const PENDING_REGISTRATION_ID = '80000000-0000-0000-0000-000000000001'
// Teacher staff seed ID from supabase/seed.sql
const TEACHER_STAFF_ID = '00000000-0000-0000-0000-000000000002'

const ROUTE_RULES: RouteRule[] = [
  {
    route: '/students/new',
    allowedRoles: ['admin'],
    redirectTo: '/students',
  },
  {
    route: '/staff/new',
    allowedRoles: ['admin'],
    redirectTo: '/staff',
  },
  {
    route: '/classes/new',
    allowedRoles: ['admin', 'headteacher'],
    redirectTo: '/classes',
  },
  {
    route: '/lesson-plans/new',
    allowedRoles: ['admin', 'headteacher', 'teacher'],
    redirectTo: '/lesson-plans',
  },
  {
    route: '/reports',
    allowedRoles: ['admin', 'headteacher', 'secretary'],
    redirectTo: '/dashboard',
  },
  {
    route: '/guardians',
    allowedRoles: ['admin'],
    redirectTo: '/students',
  },
  {
    route: `/guardians/${GUARDIAN_ID}`,
    allowedRoles: ['admin'],
    redirectTo: '/students',
  },
  {
    route: `/guardians/${GUARDIAN_ID}/edit`,
    allowedRoles: ['admin'],
    redirectTo: '/students',
  },
  {
    route: '/finance',
    allowedRoles: ['admin'],
    redirectTo: '/dashboard',
  },
  {
    route: '/finance/fee-plans/new',
    allowedRoles: ['admin'],
    redirectTo: '/dashboard',
  },
  {
    route: '/hr',
    allowedRoles: ['admin'],
    redirectTo: '/dashboard',
  },
  {
    route: `/hr/staff/${TEACHER_STAFF_ID}`,
    allowedRoles: ['admin'],
    redirectTo: '/dashboard',
  },
  {
    route: '/registrations',
    allowedRoles: ['admin', 'headteacher', 'secretary'],
    redirectTo: '/dashboard',
  },
  {
    route: `/registrations/${PENDING_REGISTRATION_ID}`,
    allowedRoles: ['admin', 'headteacher', 'secretary'],
    redirectTo: '/dashboard',
  },
]

function getRoleFromProject(projectName: string): Role {
  const role = projectName.split(':')[1]
  return role as Role
}

for (const { route, allowedRoles, redirectTo } of ROUTE_RULES) {
  test.describe(`Route: ${route}`, () => {
    test('access is allowed or redirected based on role', async ({
      page,
    }, testInfo) => {
      const role = getRoleFromProject(testInfo.project.name)
      const isAllowed = allowedRoles.includes(role)

      await page.goto(route)

      if (isAllowed) {
        // Should stay on (or navigate within) the target route, not be redirected away
        await expect(page).toHaveURL(
          new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        )
      } else {
        // Should be redirected to the fallback route
        await expect(page).toHaveURL(
          new RegExp(redirectTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        )
      }
    })
  })
}
