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

  test('creates a staff payroll record with NI number, address and bank details', async ({
    page,
  }) => {
    const row = page.getByTestId(`payroll-row-${staffId}`)
    await loadWithFreshData(page, '/hr', async () => {
      await expect(row).toContainText('No record', { timeout: 3_000 })
    })

    await row.getByRole('link', { name: 'Add record' }).click()
    await expect(page).toHaveURL(`/hr/staff/${staffId}`)

    await page.getByLabel('Payment funding').selectOption('school')
    await page.getByLabel('Account holder name').fill('Dr Hr')
    // Empty bank fields are visible while first entered
    const sortCode = page.getByLabel('Sort code', { exact: true })
    await expect(sortCode).toHaveAttribute('type', 'text')
    await sortCode.fill('12-34-56')
    await page.getByRole('button', { name: 'Hide sort code' }).click()
    await expect(sortCode).toHaveAttribute('type', 'password')
    await page.getByLabel('Account number', { exact: true }).fill('12345678')
    await page.getByLabel('Address line 1').fill('1 High Street')
    await page.getByLabel('City').fill('London')
    await page.getByLabel('Postcode').fill('N1 1AA')
    await page.getByLabel('National Insurance number').fill('ab 12 34 56 c')
    await page.getByRole('button', { name: 'Save payroll record' }).click()

    await expect(page).toHaveURL('/hr')
    await expect(row).toContainText('School')
    await expect(row).toContainText('••••5678')
    await expect(row).not.toContainText('12345678')

    const { data: payroll } = await db
      .from('staff_payroll')
      .select('national_insurance_number, address_line_1, city, postcode')
      .eq('staff_id', staffId)
      .single()
    expect(payroll).toEqual({
      national_insurance_number: 'AB123456C',
      address_line_1: '1 High Street',
      city: 'London',
      postcode: 'N1 1AA',
    })

    // Saved bank details are masked when the record is reopened
    await row.getByRole('link', { name: 'Edit' }).click()
    await expect(page.getByLabel('Sort code', { exact: true })).toHaveAttribute(
      'type',
      'password',
    )
  })
})
