import { test, expect } from '../../fixtures/index'
import { SEED_IDS } from '../../fixtures/seed'

test.use({ storageState: 'e2e/.auth/admin.json' })

test.describe('Student view page', () => {
  test('Details links from the students list to the view page', async ({
    page,
  }) => {
    // A stable seeded row, found by its href rather than by name or list
    // position: the shared /students list is written to by other tests
    // running in parallel, and test-created rows come and go.
    await page.goto('/students')
    // Stacked mode mounts the Details link twice per row (a mobile summary
    // and a desktop cell, one hidden by CSS per breakpoint), so this is
    // narrowed to the one actually visible at the test's viewport.
    await page
      .locator(`a[href="/students/${SEED_IDS.students.alice}"]:visible`)
      .click()

    await expect(page).toHaveURL(`/students/${SEED_IDS.students.alice}`)
    await expect(page.getByText('Guardians & contacts')).toBeVisible()
  })

  test('shows the not-found page for a student that does not exist', async ({
    page,
  }) => {
    await page.goto('/students/00000000-0000-0000-0000-000000000000')
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  })

  test('shows guardian details and an Edit link for admin', async ({
    page,
  }) => {
    await page.goto(`/students/${SEED_IDS.students.alice}`)
    await expect(page.getByText('Guardians & contacts')).toBeVisible()
    // The page header's own "Edit" link, not a guardian card's "Edit" link.
    await expect(page.getByRole('link', { name: 'Edit' }).first()).toBeVisible()
  })
})
