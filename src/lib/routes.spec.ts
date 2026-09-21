import { describe, it, expect } from 'vitest'

import { canAccessPath, routeForPath, routes } from './routes'

describe('routeForPath', () => {
  it('matches an exact route', () => {
    expect(routeForPath('/finance')?.href).toBe('/finance')
  })

  it('matches nested paths by longest prefix', () => {
    expect(routeForPath('/finance/students/x')?.href).toBe('/finance')
  })

  it('does not match a path that merely starts with the same characters', () => {
    expect(routeForPath('/financeX')).toBeUndefined()
  })

  it('returns undefined for an unknown path', () => {
    expect(routeForPath('/unknown')).toBeUndefined()
  })
})

describe('canAccessPath', () => {
  it('allows any role when the route has no permission', () => {
    expect(canAccessPath('/dashboard', 'teacher')).toBe(true)
  })

  it('allows any role for an unknown path', () => {
    expect(canAccessPath('/unknown', 'teacher')).toBe(true)
  })

  it('enforces each route permission for every role', () => {
    const allRoles = ['admin', 'headteacher', 'secretary', 'teacher'] as const
    for (const route of routes.filter((r) => r.permission)) {
      for (const role of allRoles) {
        expect(canAccessPath(route.href, role)).toBe(route.permission!(role))
      }
    }
  })
})
