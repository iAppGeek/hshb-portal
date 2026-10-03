import { test, expect } from '@playwright/test'

// Netlify's netlify.toml headers never reach server-rendered pages, so
// next.config.js sets these itself. Check them on real page responses.
test.use({ storageState: { cookies: [], origins: [] } })

const EXPECTED_HEADERS = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
}

test.describe('Security headers', () => {
  for (const path of ['/login', '/register']) {
    test(`are set on the server-rendered ${path} page`, async ({ request }) => {
      const response = await request.get(path)

      expect(response.ok()).toBe(true)
      expect(response.headers()).toMatchObject(EXPECTED_HEADERS)
    })
  }
})
