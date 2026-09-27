import { test, expect } from '../../fixtures/index'
import { SEED_IDS } from '../../fixtures/seed'

test.use({ storageState: 'e2e/.auth/admin.json' })

test.describe('Student view page', () => {
  test('opens from the students list and shows details', async ({ page }) => {
    await page.goto('/students')
    await page.getByRole('link', { name: 'Details' }).first().click()

    await expect(page).toHaveURL(/\/students\/[\w-]+$/)
    await expect(page.getByRole('link', { name: 'Edit' })).toBeVisible()
  })

  test('shows the not-found page for a student that does not exist', async ({
    page,
  }) => {
    await page.goto('/students/00000000-0000-0000-0000-000000000000')
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  })

  test('shows guardian details on the student page', async ({ page }) => {
    await page.goto(`/students/${SEED_IDS.students.alice}`)
    await expect(page.getByText('Guardians & contacts')).toBeVisible()
  })
})
