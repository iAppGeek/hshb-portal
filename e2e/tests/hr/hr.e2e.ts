import { test, expect } from '../../fixtures/index'
import { loadWithFreshData } from '../../fixtures/loadWithFreshData'
import { db, deleteStaffByEmail } from '../../fixtures/seed'

// HR is admin-only; redirects for other roles are covered by
// permissions/entitlements.e2e.ts and navigation/sidebar.e2e.ts.
test.use({ storageState: 'e2e/.auth/admin.json' })
test.describe.configure({ timeout: 90_000 })

test.describe('HR', () => {
  let staffEmail: string
  let staffId: string

  test.beforeEach(async ({}, testInfo) => {
    // Tests run fully parallel, so names must be unique per test as well as
    // per project, or one test's cleanup deletes another's fixtures.
    const suffix =
      `${testInfo.project.name}${testInfo.testId.slice(-6)}`.replace(
        /[^a-z0-9]/gi,
        '',
      )
    staffEmail = `e2e.hr.${suffix.toLowerCase()}@test.hshb.local`

    const { data: staff, error: staffError } = await db
      .from('staff')
      .insert({
        title: 'Dr',
        first_name: 'Hr',
        last_name: `E2EHrStaff${suffix}`,
        email: staffEmail,
        role: 'teacher',
      })
      .select('id')
      .single()
    if (staffError) throw staffError
    staffId = staff.id
  })

  test.afterEach(async () => {
    await deleteStaffByEmail(staffEmail)
  })

  test('creates a staff payroll record with masked bank details', async ({
    page,
    isMobile,
  }) => {
    const row = page.getByTestId(`payroll-row-${staffId}`)
    await loadWithFreshData(page, isMobile, '/hr', async () => {
      await expect(row).toContainText('No record', { timeout: 3_000 })
    })

    await row.getByRole('link', { name: 'Add record' }).click()
    await expect(page).toHaveURL(`/hr/staff/${staffId}`)

    await page.getByLabel('Payment funding').selectOption('school')
    await page.getByLabel('Account holder name').fill('Dr Hr')
    const sortCode = page.getByLabel('Sort code', { exact: true })
    await sortCode.fill('12-34-56')
    await expect(sortCode).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Show sort code' }).click()
    await expect(sortCode).toHaveAttribute('type', 'text')
    await page.getByLabel('Account number', { exact: true }).fill('12345678')
    await page.getByRole('button', { name: 'Save payroll record' }).click()

    await expect(page).toHaveURL('/hr')
    await expect(row).toContainText('School')
    await expect(row).toContainText('••••5678')
    await expect(row).not.toContainText('12345678')
  })
})
