import { test, expect } from '../../fixtures/index'
import { loadWithFreshData } from '../../fixtures/loadWithFreshData'
import {
  db,
  SEED_IDS,
  deleteAcademicYearByCode,
  deleteClassByName,
  deleteFeePlansByName,
  deleteStudentsByLastName,
} from '../../fixtures/seed'

// Finance is admin-only; redirects for other roles are covered by
// permissions/entitlements.e2e.ts and navigation/sidebar.e2e.ts.
test.use({ storageState: 'e2e/.auth/admin.json' })
test.describe.configure({ timeout: 90_000 })

// Guardian seed ID from supabase/seed.sql
const GUARDIAN_ID = '20000000-0000-0000-0000-000000000001'

// A far-future year (unique per test, so parallel runs don't collide) keeps
// this test's class out of every other year's picker and means no
// instalment is due yet, so status is deterministic.
function academicYearForSuffix(suffix: string): {
  code: string
  start_date: string
  end_date: string
} {
  let hash = 0
  for (const ch of suffix) hash = (hash * 31 + ch.charCodeAt(0)) % 400
  const year = 2500 + hash
  return {
    code: `${year}-${String((year + 1) % 100).padStart(2, '0')}`,
    start_date: `${year}-09-01`,
    end_date: `${year + 1}-08-31`,
  }
}

test.describe('Finance', () => {
  let suffix: string
  let className: string
  let planName: string
  let studentLastName: string
  let studentId: string
  let academicYearId: string
  let academicYearCode: string

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

    const year = academicYearForSuffix(suffix)
    academicYearCode = year.code
    const { data: yearRow, error: yearError } = await db
      .from('academic_years')
      .insert(year)
      .select('id')
      .single()
    if (yearError) throw yearError
    academicYearId = yearRow.id

    const { data: cls, error: classError } = await db
      .from('classes')
      .insert({
        name: className,
        year_group: 'Year 9',
        teacher_id: SEED_IDS.staff.teacher,
        academic_year_id: academicYearId,
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
  })

  test.afterEach(async () => {
    await deleteFeePlansByName(planName)
    await deleteStudentsByLastName(studentLastName)
    await deleteClassByName(className)
    await deleteAcademicYearByCode(academicYearCode)
  })

  test('sets up a fee plan and records and deletes a student payment', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/finance?tab=fee-plans')
    await expect(
      page.getByRole('link', { name: 'Add fee plan' }),
    ).toHaveAttribute(
      'href',
      `/finance/fee-plans/new?year=${SEED_IDS.academicYears.current}`,
    )

    const classCheckbox = page.getByRole('checkbox', {
      name: new RegExp(`^${className}`),
    })
    await loadWithFreshData(
      page,
      isMobile,
      '/finance/fee-plans/new',
      async () => {
        await page.getByLabel('Academic year').selectOption(academicYearId)
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
    await page.goto(`/finance?tab=fee-plans&year=${academicYearId}`)
    await expect(
      page.getByRole('row', { name: new RegExp(planName) }),
    ).toContainText(className)

    await page.goto(`/finance/students/${studentId}?year=${academicYearId}`)
    await expect(page.getByTestId('fee-status')).toHaveText('No plan')
    await page.getByLabel('Payment plan').selectOption('monthly')
    await page.getByRole('button', { name: 'Save fee account' }).click()
    await expect(page.getByTestId('fee-plan')).toContainText(planName)
    await expect(page.getByTestId('fee-status')).toHaveText('Up to date')

    const reference = `E2E-${suffix}`
    await page.getByLabel('Amount (£)').fill('100')
    await page
      .getByLabel('Payment date')
      .fill(academicYearForSuffix(suffix).start_date)
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
})
