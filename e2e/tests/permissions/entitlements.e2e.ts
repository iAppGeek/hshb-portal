import { test, expect } from '../../fixtures/index'

type Role = 'admin' | 'headteacher' | 'teacher' | 'secretary'

type RouteRule = {
  route: string
  allowedRoles: Role[]
  redirectTo: string
}

// Guardian seed ID from supabase/seed.sql
const GUARDIAN_ID = '20000000-0000-0000-0000-000000000001'

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
    route: `/guardians/${GUARDIAN_ID}/edit`,
    allowedRoles: ['admin'],
    redirectTo: '/students',
  },
  {
    route: '/documents/deleted',
    allowedRoles: ['admin'],
    redirectTo: '/dashboard',
  },
]

// Student-owned link document from supabase/seed.sql (no storage backend needed).
const SEEDED_DOC_ID = '80000000-0000-0000-0000-000000000001'

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

// The document download route is an API handler (403, not a redirect), so it
// needs status-based assertions rather than the URL-based RouteRule above.
test.describe('Route: /api/documents/[id]/download', () => {
  test('admin gets a redirect to the file; other roles are forbidden', async ({
    page,
  }, testInfo) => {
    const role = getRoleFromProject(testInfo.project.name)
    const res = await page.request.get(
      `/api/documents/${SEEDED_DOC_ID}/download`,
      { maxRedirects: 0 },
    )
    if (role === 'admin') {
      // 302 redirect to the external_url of the seeded link document
      expect(res.status()).toBe(302)
      expect(res.headers()['location']).toContain('https://')
    } else {
      expect(res.status()).toBe(403)
    }
  })
})
