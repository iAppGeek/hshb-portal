import type { Page } from '@playwright/test'

import { test, expect } from '../../fixtures/index'
import { loadWithFreshData } from '../../fixtures/loadWithFreshData'
import { deleteStaffByEmail, insertRow, sql } from '../../fixtures/seed'

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

    staffId = await insertRow('staff', {
      title: 'Dr',
      first_name: 'Hr',
      last_name: `E2EHrStaff${suffix}`,
      email: staffEmail,
      role: 'teacher',
    })
  })

  test.afterEach(async () => {
    await deleteStaffByEmail(staffEmail)
  })

  test('creates a staff payroll record with personal details and bank details', async ({
    page,
  }) => {
    const row = page.getByTestId(`payroll-row-${staffId}`)
    await loadWithFreshData(page, '/hr', async () => {
      await expect(row).toContainText('Not checked', { timeout: 3_000 })
    })

    await row.getByRole('link', { name: 'Add record' }).click()
    await expect(page).toHaveURL(`/hr/staff/${staffId}`)

    await page.getByLabel('Role').selectOption('teacher')
    await page.getByLabel('Date of birth').fill('1985-04-12')
    await page.getByLabel('Payment funding').selectOption('school')
    await page.getByLabel('Payroll reference').fill('PR-E2E')
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
    await page.getByLabel('National Insurance number').fill('AB 12 34 56 C')
    await page.getByRole('button', { name: 'Save payroll record' }).click()

    await expect(page).toHaveURL('/hr')
    // A teacher with no DBS, ID or right to work check needs action
    await expect(row).toContainText('Not checked')
    await row.getByRole('button', { name: 'Action needed' }).click()
    await expect(page.getByRole('tooltip')).toContainText(
      'an enhanced DBS is required for this role',
    )
    await expect(row).not.toContainText('12345678')

    const [payroll] =
      await sql`select job_role, date_of_birth::text, payroll_ref, national_insurance_number, address_line_1, city, postcode from staff_payroll where staff_id = ${staffId}`
    expect(payroll).toEqual({
      job_role: 'teacher',
      date_of_birth: '1985-04-12',
      payroll_ref: 'PR-E2E',
      national_insurance_number: 'AB 12 34 56 C',
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

  test('records a compliant volunteer on the Update Service', async ({
    page,
  }) => {
    const today = isoToday()
    const row = page.getByTestId(`payroll-row-${staffId}`)
    await page.goto(`/hr/staff/${staffId}`)

    await page.getByLabel('Role').selectOption('admin')
    await page.getByLabel('Date of birth').fill('1970-01-31')
    await page.getByLabel('Address line 1').fill('2 Low Road')
    await page.getByLabel('City').fill('Leeds')
    await page.getByLabel('Postcode').fill('LS1 1AA')
    await page.getByLabel('Payment funding').selectOption('volunteer')
    await page.getByLabel('ID verified', { exact: true }).check()
    await page.getByLabel('ID type').selectOption('passport')
    await page.getByLabel(/^ID verified on/).fill(today)
    await page.getByLabel('Right to work checked', { exact: true }).check()
    await page.getByLabel('Right to work checked on').fill(today)
    await page.getByLabel('DBS verified', { exact: true }).check()
    await page.getByLabel('DBS level').selectOption('enhanced')
    await page.getByLabel('DBS certificate reference').fill('001234567890')
    // Older than three years, but kept current by the Update Service
    await page.getByLabel('DBS issue date').fill('2019-05-01')
    await page.getByLabel('DBS verified on').fill(today)
    // Off the Update Service the renewal defaults to three years after issue
    await expect(page.getByLabel(/^DBS renewal due/)).toHaveValue('2022-05-01')
    await expect(
      page.getByLabel('Update Service subscription number'),
    ).toHaveCount(0)
    await page.getByLabel('Enrolled in the DBS Update Service').check()
    // On it, that guess is cleared and the subscription's date is asked for
    const renews = page.getByLabel(/^Update Service renews on/)
    await expect(renews).toHaveValue('')
    await expect(renews).not.toHaveAttribute('required')
    await renews.fill('2099-05-01')
    await page.getByLabel('Update Service subscription number').fill('C0001')
    await page.getByRole('button', { name: 'Save payroll record' }).click()

    await expect(page).toHaveURL('/hr')
    await expect(
      row.getByText('OK', { exact: true }).filter({ visible: true }),
    ).toBeVisible()
    await expect(row.getByRole('button')).toHaveCount(0)

    const [payroll] = await sql`
      select job_role, payment_funding, payroll_ref, dbs_update_service,
             dbs_update_service_number, dbs_renewal_due::text
      from staff_payroll where staff_id = ${staffId}`
    expect(payroll).toEqual({
      job_role: 'admin',
      payment_funding: 'volunteer',
      payroll_ref: null,
      dbs_update_service: true,
      dbs_update_service_number: 'C0001',
      dbs_renewal_due: '2099-05-01',
    })
  })

  test('requires a payroll reference unless the person volunteers', async ({
    page,
  }) => {
    await page.goto(`/hr/staff/${staffId}`)
    await page.getByLabel('Role').selectOption('committee')
    await page.getByLabel('Date of birth').fill('1970-01-31')
    await page.getByLabel('Address line 1').fill('2 Low Road')
    await page.getByLabel('City').fill('Leeds')
    await page.getByLabel('Postcode').fill('LS1 1AA')
    await page.getByLabel('Payment funding').selectOption('school')
    await page.getByRole('button', { name: 'Save payroll record' }).click()

    const payrollRef = page.getByLabel('Payroll reference')
    await expect(page).toHaveURL(`/hr/staff/${staffId}`)
    expect(
      await payrollRef.evaluate(
        (el) => (el as HTMLInputElement).validity.valid,
      ),
    ).toBe(false)

    await page.getByLabel('Payment funding').selectOption('volunteer')
    await expect(payrollRef).not.toHaveAttribute('required')
  })

  test('does not accept a date of birth in the future', async ({ page }) => {
    await page.goto(`/hr/staff/${staffId}`)
    await page.getByLabel('Role').selectOption('committee')
    await page.getByLabel('Payment funding').selectOption('volunteer')
    const dob = page.getByLabel('Date of birth')
    await dob.fill(addDays(isoToday(), 1))
    await page.getByRole('button', { name: 'Save payroll record' }).click()

    await expect(page).toHaveURL(`/hr/staff/${staffId}`)
    expect(
      await dob.evaluate(
        (el) => (el as HTMLInputElement).validity.rangeOverflow,
      ),
    ).toBe(true)
    const [{ count }] =
      await sql`select count(*)::int as count from staff_payroll where staff_id = ${staffId}`
    expect(count).toBe(0)
  })

  test('warns as a first aid certificate nears expiry and flags it once passed', async ({
    page,
  }) => {
    await insertPayroll(staffId, {
      ...COMPLIANT,
      first_aid_certified: true,
      first_aid_reference: 'FA-E2E',
      first_aid_issue_date: '2024-01-01',
      first_aid_verified_at: '2026-09-01',
      first_aid_expiry_date: addDays(isoToday(), 10),
    })
    const row = page.getByTestId(`payroll-row-${staffId}`)
    const warning = row.getByRole('button', { name: 'Warning' })
    await loadWithFreshData(page, '/hr', async () => {
      await expect(warning).toBeVisible({ timeout: 3_000 })
    })
    await warning.click()
    await expect(page.getByRole('tooltip')).toContainText(
      'First aid certificate expires on',
    )
    await expect(row).not.toHaveClass(/bg-red-50/)

    await sql`update staff_payroll set first_aid_expiry_date = ${addDays(isoToday(), -1)}
      where staff_id = ${staffId}`
    await page.reload()
    await expect(row).toHaveClass(/bg-red-50/)
    await row.getByRole('button', { name: 'Action needed' }).click()
    await expect(page.getByRole('tooltip')).toContainText(
      'First aid certificate expired on',
    )
  })

  test('explains why a status is not green', async ({ page }) => {
    await insertPayroll(staffId, { ...COMPLIANT, dbs_level: 'basic' })
    const row = page.getByTestId(`payroll-row-${staffId}`)
    const status = row.getByRole('button', { name: 'Action needed' })
    await loadWithFreshData(page, '/hr', async () => {
      await expect(status).toBeVisible({ timeout: 3_000 })
    })

    await status.click()
    await expect(page.getByRole('tooltip')).toContainText(
      'Basic DBS held; an enhanced DBS is required for this role',
    )
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  })

  test('warns when no address is recorded', async ({ page }) => {
    await insertPayroll(staffId, {
      ...COMPLIANT,
      address_line_1: null,
      city: null,
      postcode: null,
    })
    const row = page.getByTestId(`payroll-row-${staffId}`)
    await loadWithFreshData(page, '/hr', async () => {
      await expect(row.getByRole('button', { name: 'Warning' })).toBeVisible({
        timeout: 3_000,
      })
    })

    await row.getByRole('button', { name: 'Warning' }).click()
    await expect(page.getByRole('tooltip')).toHaveText(/No address recorded/)
  })

  test('flags a DBS not checked this school year', async ({ page }) => {
    await insertPayroll(staffId, {
      ...COMPLIANT,
      dbs_verified_at: '2025-10-01',
    })
    const row = page.getByTestId(`payroll-row-${staffId}`)
    await loadWithFreshData(page, '/hr', async () => {
      await expect(row).toContainText('1 Oct 2025', { timeout: 3_000 })
    })

    await row.getByRole('button', { name: '1 Oct 2025' }).click()
    await expect(page.getByRole('tooltip')).toContainText(
      'DBS has not been verified this school year',
    )
  })

  test('ignores a passed renewal date, on or off the Update Service', async ({
    page,
  }) => {
    // Issued within three years, so a passed renewal date off the Update
    // Service does not make it lapse.
    await insertPayroll(staffId, {
      ...COMPLIANT,
      dbs_renewal_due: '2025-01-01',
    })
    const row = page.getByTestId(`payroll-row-${staffId}`)
    await loadWithFreshData(page, '/hr', async () => {
      await expect(row).toContainText('OK', { timeout: 3_000 })
    })
    await expect(row).not.toHaveClass(/bg-red-50/)

    // On the Update Service only this school year's check matters.
    await sql`update staff_payroll set dbs_update_service = true,
      dbs_update_service_number = 'C0001' where staff_id = ${staffId}`
    await page.reload()
    await expect(
      row.getByText('OK', { exact: true }).filter({ visible: true }),
    ).toBeVisible()
    await expect(row).not.toHaveClass(/bg-red-50/)
  })

  test('highlights a certificate DBS over three years old', async ({
    page,
  }) => {
    await insertPayroll(staffId, {
      ...COMPLIANT,
      dbs_issue_date: '2020-01-01',
    })
    const row = page.getByTestId(`payroll-row-${staffId}`)
    await loadWithFreshData(page, '/hr', async () => {
      await expect(row).toHaveClass(/bg-red-50/, { timeout: 3_000 })
    })
    await expect(
      row.getByRole('button', { name: 'Action needed' }),
    ).toBeVisible()
  })

  test('does not require a DBS for an admin assistant', async ({ page }) => {
    await insertPayroll(staffId, {
      ...COMPLIANT,
      job_role: 'admin_assistant',
      dbs_verified: false,
      dbs_level: null,
      dbs_reference: null,
      dbs_issue_date: null,
      dbs_verified_at: null,
      dbs_renewal_due: null,
    })
    const row = page.getByTestId(`payroll-row-${staffId}`)
    await loadWithFreshData(page, '/hr', async () => {
      await expect(
        row.getByText('Not compulsory').filter({ visible: true }),
      ).toBeVisible({ timeout: 3_000 })
    })
    await expect(
      row.getByText('OK', { exact: true }).filter({ visible: true }),
    ).toBeVisible()
  })

  test('explains which roles need a DBS beside the role field', async ({
    page,
  }) => {
    await page.goto(`/hr/staff/${staffId}`)
    await page.getByRole('button', { name: 'Which roles need a DBS?' }).click()

    const help = page.getByRole('tooltip')
    await expect(help).toContainText('Teacher, Classroom Assistant, Admin')
    await expect(help).toContainText('Admin Assistant, Committee')
  })

  test('lists the open issues at the top of a record', async ({ page }) => {
    await insertPayroll(staffId, {
      ...COMPLIANT,
      id_verified: false,
      address_line_1: null,
      city: null,
      postcode: null,
    })
    await page.goto(`/hr/staff/${staffId}`)

    const status = page.getByRole('region', { name: 'HR status' })
    await expect(status).toContainText('Action needed: 2 open issues')
    await expect(status).toContainText('ID has not been verified')
    await expect(status).toContainText('No address recorded')
  })

  test('shows the compliance summary', async ({ page }) => {
    await page.goto('/hr')
    const summary = page.getByRole('region', { name: 'HR compliance' })
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('First aiders')
    await expect(summary).toContainText(/\d+ of 4/)
    await expect(summary).toContainText('Fire wardens')
    await expect(summary).toContainText(/\d+ of 2/)
  })

  test('shows Edit without scrolling on a phone', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'Mobile layout only')
    await insertPayroll(staffId, COMPLIANT)
    // One unbroken long name must not widen the table for every row
    const longNameEmail = staffEmail.replace('e2e.hr.', 'e2e.hr.long.')
    await insertRow('staff', {
      title: 'Mx',
      first_name: 'Long',
      last_name: `E2EHrLongName${'x'.repeat(60)}`,
      email: longNameEmail,
      role: 'teacher',
    })
    try {
      await expectEditOnScreen(page, staffId)
    } finally {
      await deleteStaffByEmail(longNameEmail)
    }
  })
})

async function expectEditOnScreen(page: Page, staffId: string): Promise<void> {
  const row = page.getByTestId(`payroll-row-${staffId}`)
  await loadWithFreshData(page, '/hr', async () => {
    await expect(row.getByRole('link', { name: 'Edit' })).toBeVisible({
      timeout: 3_000,
    })
  })

  // The row may sit below the fold; only the horizontal fit matters.
  const box = await row.getByRole('link', { name: 'Edit' }).boundingBox()
  const viewportWidth = page.viewportSize()?.width ?? 0
  expect(box).not.toBeNull()
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewportWidth)
  const overflow = await page.getByRole('table').evaluate((table) => {
    const scroller = table.parentElement as HTMLElement
    return scroller.scrollWidth - scroller.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(0)
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function isoToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

// Valid for a Teacher: enhanced DBS checked today, ID and right to work done.
const COMPLIANT = {
  payment_funding: 'school',
  payroll_ref: 'PR-E2E',
  job_role: 'teacher',
  date_of_birth: '1985-04-12',
  address_line_1: '1 High Street',
  city: 'London',
  postcode: 'N1 1AA',
  id_verified: true,
  id_type: 'passport',
  id_verified_at: '2026-09-01',
  right_to_work_checked: true,
  right_to_work_checked_at: '2026-09-01',
  dbs_verified: true,
  dbs_level: 'enhanced',
  dbs_reference: 'DBS-E2E',
  dbs_issue_date: '2025-06-01',
  dbs_verified_at: isoToday(),
  dbs_renewal_due: '2028-06-01',
}

async function insertPayroll(
  staffId: string,
  values: Record<string, unknown>,
): Promise<void> {
  await insertRow('staff_payroll', { staff_id: staffId, ...values })
}
