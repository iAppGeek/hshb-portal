import { test, expect } from '../../fixtures/index'

test.use({ storageState: 'e2e/.auth/admin.json' })

test.describe('Lesson plan view page', () => {
  test('viewing a lesson plan from the list shows its details', async ({
    page,
  }) => {
    await page.goto('/lesson-plans')
    await page.getByRole('link', { name: 'View' }).first().click()

    await expect(page).toHaveURL(/\/lesson-plans\/[\w-]+$/)
    await expect(
      page.getByText('Introduction to addition and subtraction.'),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit' })).toBeVisible()
  })
})
