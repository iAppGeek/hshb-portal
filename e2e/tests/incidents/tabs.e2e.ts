import { test, expect } from '../../fixtures/index'

test.use({ storageState: 'e2e/.auth/admin.json' })

test.describe('Incidents tabs', () => {
  test('switching tab changes the URL and the rows shown', async ({ page }) => {
    await page.goto('/incidents')
    await expect(page).toHaveURL(/\/incidents(\?type=medical)?$/)
    await expect(page.getByText('Allergic reaction')).toBeVisible()
    await expect(page.getByText('Disruptive in class')).not.toBeVisible()

    await page.getByRole('link', { name: 'Behaviour' }).click()
    await expect(page).toHaveURL('/incidents?type=behaviour')
    await expect(page.getByText('Disruptive in class')).toBeVisible()
    await expect(page.getByText('Allergic reaction')).not.toBeVisible()
  })
})
