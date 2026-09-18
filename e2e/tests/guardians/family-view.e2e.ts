import { test, expect } from '../../fixtures/index'
import { SEED_IDS } from '../../fixtures/seed'

// Only admins can view guardians
test.use({ storageState: 'e2e/.auth/admin.json' })

test.describe('Guardian search and family view', () => {
  test('finds a guardian by email and shows both children, including one with a different primary guardian', async ({
    page,
  }) => {
    await page.goto('/guardians')

    // Search by email. Stacked mode's mobile summary title duplicates the
    // desktop name cell, and only one of the two is visible at a given
    // viewport.
    await page.getByPlaceholder(/Search by name/).fill('gary.alice@example.com')
    await expect(
      page.getByText('AliceGuardian, Gary').filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(page.getByText('BobGuardian, Grace')).not.toBeVisible()

    await page.getByRole('link', { name: 'View' }).click()
    await expect(page).toHaveURL(`/guardians/${SEED_IDS.guardians.gary}`)

    // Alice — primary for Gary
    await expect(page.getByText('Student, Alice')).toBeVisible()
    // Bob — Gary is secondary/Father; Grace is his primary
    await expect(page.getByText('Student, Bob')).toBeVisible()
    await expect(page.getByText(/Father/)).toBeVisible()

    // The other parent surfaces as a co-guardian rather than requiring a
    // shared family record — this is the different-primary-guardians case.
    await expect(page.getByText('Also linked')).toBeVisible()
    await expect(page.getByText('BobGuardian, Grace')).toBeVisible()
    await expect(
      page.getByText('Primary guardian for Bob Student'),
    ).toBeVisible()
  })

  test('searches by name and phone', async ({ page }) => {
    await page.goto('/guardians')

    await page.getByPlaceholder(/Search by name/).fill('CarolGuardian')
    await expect(
      page.getByText('CarolGuardian, Greg').filter({ visible: true }).first(),
    ).toBeVisible()
    await expect(page.getByText('AliceGuardian, Gary')).not.toBeVisible()

    await page.getByPlaceholder(/Search by name/).fill('07711000003')
    await expect(
      page.getByText('CarolGuardian, Greg').filter({ visible: true }).first(),
    ).toBeVisible()
  })
})
