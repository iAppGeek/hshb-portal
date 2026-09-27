import { test, expect } from '../../fixtures/index'

test.use({ storageState: 'e2e/.auth/admin.json' })

test.describe('Incidents tabs', () => {
  test('switching tab changes the URL and the rows shown', async ({ page }) => {
    // Matched at the row level, not a specific cell's text: the grid's
    // stacked mobile mode renders one <tr> per incident either way, so this
    // holds regardless of which of its cells the viewport shows.
    const medicalRow = () =>
      page.getByRole('row').filter({ hasText: 'Allergic reaction' })
    const behaviourRow = () =>
      page.getByRole('row').filter({ hasText: 'Disruptive in class' })

    await page.goto('/incidents')
    await expect(page).toHaveURL(/\/incidents(\?type=medical)?$/)
    await expect(medicalRow()).toBeVisible()
    await expect(behaviourRow()).toHaveCount(0)

    await page.getByRole('link', { name: 'Behaviour' }).click()
    await expect(page).toHaveURL('/incidents?type=behaviour')
    await expect(behaviourRow()).toBeVisible()
    await expect(medicalRow()).toHaveCount(0)
  })
})
