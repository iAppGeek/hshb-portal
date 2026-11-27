import { test, expect } from '../../fixtures/index'

test.describe('Dashboard HR compliance tile', () => {
  test('admins see the HR compliance summary and can open HR; other roles do not', async ({
    page,
  }, testInfo) => {
    await page.goto('/dashboard')
    const tile = page.getByRole('region', { name: 'HR compliance' })

    if (!testInfo.project.name.endsWith(':admin')) {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(tile).toHaveCount(0)
      return
    }

    await expect(tile).toBeVisible()
    await expect(tile).toContainText(/\d+ of 4/)
    await expect(tile).toContainText(/\d+ of 2/)
    await tile.getByRole('link', { name: 'HR compliance' }).click()
    await expect(page).toHaveURL('/hr')
  })
})
