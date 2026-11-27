import { test, expect } from '../../fixtures/index'

test.describe('Dashboard HR compliance tile', () => {
  test('admins see the overall HR status and can open HR; other roles do not', async ({
    page,
  }, testInfo) => {
    await page.goto('/dashboard')
    const tile = page.getByRole('link', { name: /^HR compliance/ })

    if (!testInfo.project.name.endsWith(':admin')) {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(tile).toHaveCount(0)
      return
    }

    await expect(tile).toBeVisible()
    await expect(tile).toContainText(/OK|Warning|Action needed/)
    await expect(tile).toContainText(/No pending actions|\d+ pending actions?/)
    await tile.click()
    await expect(page).toHaveURL('/hr')
  })

  test('everyone sees their own HR Data status', async ({ page }, testInfo) => {
    await page.goto('/dashboard')
    const tile = page.getByRole('region', { name: 'HR Data' })

    await expect(tile).toBeVisible()
    await expect(tile).toContainText(/OK|Warning|Action needed/)
    await expect(tile.getByRole('link')).toHaveCount(0)

    // The seeded admin has no HR record.
    if (testInfo.project.name.endsWith(':admin')) {
      await expect(
        tile.getByRole('list', { name: 'Open issues' }),
      ).toContainText('No HR record')
      await expect(tile).toContainText('Please contact the Committee.')
    }
  })
})
