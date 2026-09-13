import type { Page } from '@playwright/test'

import { test, expect } from '../../fixtures/index'
import {
  db,
  SEED_IDS,
  deleteClassByName,
  deleteFeePlansByName,
  deleteStaffByEmail,
  deleteStudentsByLastName,
} from '../../fixtures/seed'

// Finance is admin-only; redirects for other roles are covered by
// permissions/entitlements.e2e.ts and navigation/sidebar.e2e.ts.
test.use({ storageState: 'e2e/.auth/admin.json' })
test.describe.configure({ timeout: 90_000 })

// A future year keeps the seed classes out of the class picker and means no
// instalment is due yet, so status is deterministic.
const ACADEMIC_YEAR = '2031-32'
// Guardian seed ID from supabase/seed.sql
const GUARDIAN_ID = '20000000-0000-0000-0000-000000000001'

// Fixture rows bypass the app's cache invalidation. Refresh and reload until
// they show, since a parallel test can repopulate a shared cache between this
// test's insert and its refresh.
async function loadWithFreshData(
  page: Page,
  isMobile: boolean,
  path: string,
  ready: () => Promise<void>,
): Promise<void> {
  await expect(async () => {
    await page.goto(path)
    if (isMobile) {
      await page.getByRole('button', { name: 'Open navigation' }).click()
    }
    const refreshed = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.ok(),
    )
    await page
      .getByRole('button', { name: 'Refresh data' })
      .filter({ visible: true })
      .click()
    await refreshed
    await page.goto(path)
    await ready()
  }).toPass({ timeout: 45_000 })
}

test.describe('Finance', () => {
  let suffix: string
  let className: string
  let planName: string
  let studentLastName: string
  let staffEmail: string
  let studentId: string
  let staffId: string

  test.beforeEach(async ({}, testInfo) => {
    // Tests run fully parallel, so names must be unique per test as well as
    // per project, or one test's cleanup deletes another's fixtures.
    suffix = `${testInfo.project.name}${testInfo.testId.slice(-6)}`.replace(
      /[^a-z0-9]/gi,
      '',
    )
    className = `E2EFinClass${suffix}`
    planName = `E2EFinPlan${suffix}`
    studentLastName = `E2EFinStudent${suffix}`
    staffEmail = `e2e.finance.${suffix.toLowerCase()}@test.hshb.local`

    const { data: cls, error: classError } = await db
      .from('classes')
      .insert({
        name: className,
        year_group: 'Year 9',
        teacher_id: SEED_IDS.staff.teacher,
        academic_year: ACADEMIC_YEAR,
      })
      .select('id')
      .single()
    if (classError) throw classError

    const { data: student, error: studentError } = await db
      .from('students')
      .insert({
        first_name: 'Fin',
        last_name: studentLastName,
        primary_guardian_id: GUARDIAN_ID,
        address_guardian_id: GUARDIAN_ID,
      })
      .select('id')
      .single()
    if (studentError) throw studentError
    studentId = student.id

    const { error: enrolError } = await db
      .from('student_classes')
      .insert({ student_id: studentId, class_id: cls.id })
    if (enrolError) throw enrolError

    const { data: staff, error: staffError } = await db
      .from('staff')
      .insert({
        title: 'Dr',
        first_name: 'Fin',
        last_name: `E2EFinStaff${suffix}`,
        email: staffEmail,
        role: 'teacher',
      })
      .select('id')
      .single()
    if (staffError) throw staffError
    staffId = staff.id
  })

  test.afterEach(async () => {
    await deleteFeePlansByName(planName)
    await deleteStudentsByLastName(studentLastName)
    await deleteClassByName(className)
    await deleteStaffByEmail(staffEmail)
  })

  test('sets up a fee plan and records and deletes a student payment', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/finance?tab=fee-plans')
    await expect(
      page.getByRole('link', { name: 'Add fee plan' }),
    ).toHaveAttribute('href', '/finance/fee-plans/new')

    const classCheckbox = page.getByRole('checkbox', {
      name: new RegExp(`^${className}`),
    })
    await loadWithFreshData(
      page,
      isMobile,
      '/finance/fee-plans/new',
      async () => {
        await page.getByLabel('Academic year').fill(ACADEMIC_YEAR)
        await expect(classCheckbox).toBeVisible({ timeout: 3_000 })
      },
    )

    await page.getByRole('textbox', { name: /^Name/ }).fill(planName)
    await page.getByLabel('Full year amount').fill('800')
    await page.getByLabel('Monthly instalment').fill('100')
    await page.getByLabel('Termly instalment').fill('266.67')
    await classCheckbox.check()
    await page.getByRole('button', { name: 'Add fee plan' }).click()

    await expect(page).toHaveURL('/finance?tab=fee-plans')
    await expect(
      page.getByRole('row', { name: new RegExp(planName) }),
    ).toContainText(className)

    await page.goto(`/finance/students/${studentId}`)
    await expect(page.getByTestId('fee-status')).toHaveText('No plan')
    await page.getByLabel('Payment plan').selectOption('monthly')
    await page.getByRole('button', { name: 'Save fee account' }).click()
    await expect(page.getByTestId('fee-plan')).toContainText(planName)
    await expect(page.getByTestId('fee-status')).toHaveText('Up to date')

    const reference = `E2E-${suffix}`
    await page.getByLabel('Amount (£)').fill('100')
    await page.getByLabel('Payment date').fill('2031-09-01')
    await page.getByLabel('Reference').fill(reference)
    await page.getByLabel('Method').selectOption('cash')
    await page.getByRole('button', { name: 'Record payment' }).click()

    const paymentRow = page.getByRole('row', { name: new RegExp(reference) })
    await expect(paymentRow).toContainText('£100.00')
    await expect(page.getByTestId('paid-to-date')).toHaveText('£100.00')

    page.once('dialog', (dialog) => dialog.accept())
    await page
      .getByRole('button', { name: `Delete payment ${reference}` })
      .click()
    await expect(paymentRow).toHaveCount(0)
    await expect(page.getByTestId('paid-to-date')).toHaveText('£0.00')
  })

  test('creates a staff payroll record with masked bank details', async ({
    page,
    isMobile,
  }) => {
    const row = page.getByTestId(`payroll-row-${staffId}`)
    await loadWithFreshData(page, isMobile, '/finance?tab=staff', async () => {
      await expect(row).toContainText('No record', { timeout: 3_000 })
    })

    await row.getByRole('link', { name: 'Add record' }).click()
    await expect(page).toHaveURL(`/finance/staff/${staffId}`)

    await page.getByLabel('Payment funding').selectOption('school')
    await page.getByLabel('Account holder name').fill('Dr Fin')
    const sortCode = page.getByLabel('Sort code', { exact: true })
    await sortCode.fill('12-34-56')
    await expect(sortCode).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Show sort code' }).click()
    await expect(sortCode).toHaveAttribute('type', 'text')
    await page.getByLabel('Account number', { exact: true }).fill('12345678')
    await page.getByRole('button', { name: 'Save payroll record' }).click()

    await expect(page).toHaveURL('/finance?tab=staff')
    await expect(row).toContainText('School')
    await expect(row).toContainText('••••5678')
    await expect(row).not.toContainText('12345678')
  })
})
