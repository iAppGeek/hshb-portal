import { test, expect } from '../../fixtures/index'
import { db } from '../../fixtures/seed'

test.use({ storageState: 'e2e/.auth/admin.json' })

test.describe('Academic years admin', () => {
  let code: string

  test.beforeEach(({}, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '').slice(-2)
    code = `20${suffix}-${(Number(suffix) + 1).toString().padStart(2, '0')}`
  })

  test.afterEach(async () => {
    await db.from('academic_years').delete().eq('code', code)
  })

  test('adds a year on its own page and shows it in the list', async ({
    page,
  }) => {
    await page.goto('/admin/academic-years/new')
    await page.locator('input[name="code"]').fill(code)
    await page.locator('input[name="start_date"]').fill('2030-09-01')
    await page.locator('input[name="end_date"]').fill('2031-08-31')
    await page.getByRole('button', { name: 'Add year' }).click()

    await expect(page).toHaveURL('/admin?tab=academic-years')
    await expect(page.getByText(code)).toBeVisible()
  })

  test('edits a year on its own page', async ({ page }) => {
    const { data, error } = await db
      .from('academic_years')
      .insert({ code, start_date: '2030-09-01', end_date: '2031-08-31' })
      .select('id')
      .single()
    if (error) throw error

    await page.goto(`/admin/academic-years/${data.id}/edit`)
    await page.locator('input[name="start_date"]').fill('2030-09-15')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page).toHaveURL('/admin?tab=academic-years')
  })
})
