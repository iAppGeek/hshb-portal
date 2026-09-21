import { test, expect } from '../../fixtures/index'

// Seeded test users all have a role, so the role-less path is covered by unit
// tests; here we check staff can't get stuck on the no-access page.
test.describe('No access page', () => {
  test('signed-in staff visiting /no-access are sent to the dashboard', async ({
    page,
  }) => {
    await page.goto('/no-access')
    await expect(page).toHaveURL('/dashboard')
  })
})
