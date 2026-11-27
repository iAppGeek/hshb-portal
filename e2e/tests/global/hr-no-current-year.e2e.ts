import { test, expect } from '../../fixtures/index'
import { SEED_IDS, setCurrentAcademicYear, sql } from '../../fixtures/seed'

// Clearing the current academic year affects every page, so this file runs in
// the `global` project once the per-role projects have finished.

test.describe.serial('HR with no current academic year', () => {
  test.beforeAll(async () => {
    await sql`update academic_years set is_current = false where is_current`
  })

  test.afterAll(async () => {
    await setCurrentAcademicYear(SEED_IDS.academicYears.current)
  })

  test('warns that DBS checks cannot be confirmed and flags the summary', async ({
    page,
  }) => {
    await page.goto('/hr')

    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'No academic year is marked as current' }),
    ).toBeVisible()
    const summary = page.getByRole('region', { name: 'HR compliance' })
    await expect(
      summary.getByRole('button', { name: 'Action needed' }),
    ).toBeVisible()
  })
})
