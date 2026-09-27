import { test, expect } from '../../fixtures/index'
import { db } from '../../fixtures/seed'

test.use({ storageState: 'e2e/.auth/admin.json' })

test.describe('Academic years admin', () => {
  let code: string
  let startDate: string
  let endDate: string

  test.beforeEach(({}, testInfo) => {
    // A distinct, purely numeric year — and date range — per worker so
    // parallel runs don't collide (the code must be two consecutive years,
    // e.g. "2090-91", and no two years may have overlapping date ranges).
    const year = 2090 + testInfo.parallelIndex
    code = `${year}-${((year + 1) % 100).toString().padStart(2, '0')}`
    startDate = `${year}-09-01`
    endDate = `${year + 1}-08-31`
  })

  test.afterEach(async () => {
    await db.from('academic_years').delete().eq('code', code)
  })

  test('adds a year on its own page and shows it in the list', async ({
    page,
  }) => {
    await page.goto('/admin/academic-years/new')
    await page.locator('input[name="code"]').fill(code)
    await page.locator('input[name="start_date"]').fill(startDate)
    await page.locator('input[name="end_date"]').fill(endDate)
    await page.getByRole('button', { name: 'Add year' }).click()

    await expect(page).toHaveURL('/admin?tab=academic-years')
    await expect(page.getByText(code)).toBeVisible()
  })

  test('edits a year on its own page', async ({ page }) => {
    const { data, error } = await db
      .from('academic_years')
      .insert({ code, start_date: startDate, end_date: endDate })
      .select('id')
      .single()
    if (error) throw error

    await page.goto(`/admin/academic-years/${data.id}/edit`)
    await page
      .locator('input[name="start_date"]')
      .fill(`${startDate.slice(0, 8)}15`)
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page).toHaveURL('/admin?tab=academic-years')
  })
})
