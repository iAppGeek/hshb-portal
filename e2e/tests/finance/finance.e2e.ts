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
    await loadWithFreshData(page, '/finance/fee-plans/new', async () => {
      await page.getByLabel('Academic year').selectOption(academicYearId)
      await expect(classCheckbox).toBeVisible({ timeout: 3_000 })
    })

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

// Baseline for the shared-grids migration (plans/shared-grids.md §6): covers
// Student Fees search and every filter dropdown against main's current
// markup, before FunctionalGrid replaces it in phase 4.
test.describe('Finance — Student Fees search and filters', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' })

  let suffix: string
  let yearId: string
  let yearCode: string
  let classAName: string
  let classBName: string
  let planAName: string
  let planBName: string
  let searchLastName: string
  let noPlanLastName: string
  let conflictLastName: string
  let priorOwedLastName: string
  let studentCode: string

  test.beforeEach(async ({}, testInfo) => {
    suffix = `${testInfo.project.name}${testInfo.testId.slice(-6)}`.replace(
      /[^a-z0-9]/gi,
      '',
    )
    classAName = `E2EFeesClassA${suffix}`
    classBName = `E2EFeesClassB${suffix}`
    planAName = `E2EFeesPlanA${suffix}`
    planBName = `E2EFeesPlanB${suffix}`
    searchLastName = `E2EFeesAaa${suffix}`
    noPlanLastName = `E2EFeesBbb${suffix}`
    conflictLastName = `E2EFeesCcc${suffix}`
    priorOwedLastName = `E2EFeesDdd${suffix}`
    studentCode = `E2EFCODE${suffix}`

    const year = academicYearForSuffix(suffix)
    yearCode = year.code

    const { data: yearRow, error: yearError } = await db
      .from('academic_years')
      .insert(year)
      .select('id')
      .single()
    if (yearError) throw yearError
    yearId = yearRow.id

    // The prior-year debt for "owes_prior" reuses the already-seeded previous
    // academic year (2025-26) instead of inserting a new one: every test's
    // "current" year code is drawn from a shared, finite hash space (see
    // academicYearForSuffix above), so inserting a second one here would
    // meaningfully raise the odds of a unique-constraint collision with a
    // concurrently running test.
    const priorYearId = SEED_IDS.academicYears.previous

    const { data: classA, error: classAError } = await db
      .from('classes')
      .insert({
        name: classAName,
        year_group: 'Year 9',
        teacher_id: SEED_IDS.staff.teacher,
        academic_year_id: yearId,
      })
      .select('id')
      .single()
    if (classAError) throw classAError

    const { data: classB, error: classBError } = await db
      .from('classes')
      .insert({
        name: classBName,
        year_group: 'Year 9',
        teacher_id: SEED_IDS.staff.teacher,
        academic_year_id: yearId,
      })
      .select('id')
      .single()
    if (classBError) throw classBError

    const { data: planA, error: planAError } = await db
      .from('fee_plans')
      .insert({
        name: planAName,
        academic_year_id: yearId,
        full_year_amount: 800,
        monthly_instalment_amount: 100,
        termly_instalment_amount: 266.67,
        active: true,
      })
      .select('id')
      .single()
    if (planAError) throw planAError

    const { data: planB, error: planBError } = await db
      .from('fee_plans')
      .insert({
        name: planBName,
        academic_year_id: yearId,
        full_year_amount: 900,
        monthly_instalment_amount: 112.5,
        termly_instalment_amount: 300,
        active: true,
      })
      .select('id')
      .single()
    if (planBError) throw planBError

    const { error: planClassError } = await db.from('fee_plan_classes').insert([
      { fee_plan_id: planA.id, class_id: classA.id },
      { fee_plan_id: planB.id, class_id: classB.id },
    ])
    if (planClassError) throw planClassError

    const { data: students, error: studentsError } = await db
      .from('students')
      .insert([
        {
          first_name: 'Fin',
          last_name: searchLastName,
          student_code: studentCode,
          primary_guardian_id: GUARDIAN_ID,
          address_guardian_id: GUARDIAN_ID,
        },
        {
          first_name: 'Fin',
          last_name: noPlanLastName,
          primary_guardian_id: GUARDIAN_ID,
          address_guardian_id: GUARDIAN_ID,
        },
        {
          first_name: 'Fin',
          last_name: conflictLastName,
          primary_guardian_id: GUARDIAN_ID,
          address_guardian_id: GUARDIAN_ID,
        },
        {
          first_name: 'Fin',
          last_name: priorOwedLastName,
          primary_guardian_id: GUARDIAN_ID,
          address_guardian_id: GUARDIAN_ID,
        },
      ])
      .select('id, last_name')
    if (studentsError) throw studentsError

    const idFor = (lastName: string): string => {
      const row = students.find((s) => s.last_name === lastName)
      if (!row) throw new Error(`Missing seeded student for ${lastName}`)
      return row.id
    }
    const searchId = idFor(searchLastName)
    const noPlanId = idFor(noPlanLastName)
    const conflictId = idFor(conflictLastName)
    const priorOwedId = idFor(priorOwedLastName)

    const { error: enrolError } = await db.from('student_classes').insert([
      { student_id: searchId, class_id: classA.id },
      { student_id: noPlanId, class_id: classB.id },
      { student_id: conflictId, class_id: classA.id },
      { student_id: conflictId, class_id: classB.id },
      { student_id: priorOwedId, class_id: classB.id },
    ])
    if (enrolError) throw enrolError

    // Two separate inserts, not one bulk array: PostgREST/Postgres fills a
    // missing key with NULL (not the column default) when rows in the same
    // batch differ in shape, which trips the custom_up_to_date NOT NULL check.
    const { error: searchAccountError } = await db
      .from('student_fee_accounts')
      .insert({
        student_id: searchId,
        academic_year_id: yearId,
        payment_plan: 'monthly',
      })
    if (searchAccountError) throw searchAccountError

    const { error: priorAccountError } = await db
      .from('student_fee_accounts')
      .insert({
        student_id: priorOwedId,
        academic_year_id: priorYearId,
        payment_plan: 'custom',
        custom_total_amount: 500,
        custom_up_to_date: false,
      })
    if (priorAccountError) throw priorAccountError
  })

  test.afterEach(async () => {
    await deleteFeePlansByName(planAName)
    await deleteFeePlansByName(planBName)
    await deleteStudentsByLastName(searchLastName)
    await deleteStudentsByLastName(noPlanLastName)
    await deleteStudentsByLastName(conflictLastName)
    await deleteStudentsByLastName(priorOwedLastName)
    await deleteClassByName(classAName)
    await deleteClassByName(classBName)
    await deleteAcademicYearByCode(yearCode)
  })

  test('searches and filters the Student Fees list', async ({ page }) => {
    // The Student Fees list includes every active student in the school (see
    // getStudentFeeList's `s.active || …` filter), not just this test's
    // fixtures, so "Showing X of Y" assertions below scope Y down with a
    // search for a substring shared by all four fixture students' surnames,
    // rather than asserting the whole school's total.
    const FIXTURE_QUERY = 'E2Efees'

    await loadWithFreshData(
      page,
      `/finance?tab=students&year=${yearId}`,
      async () => {
        await expect(
          page.getByText(/^Showing \d+ of \d+ students$/),
        ).toBeVisible({ timeout: 3_000 })
      },
    )

    const search = page.getByRole('searchbox', { name: 'Search students' })
    const classFilter = page.getByRole('combobox', { name: 'Filter by class' })
    const planFilter = page.getByRole('combobox', {
      name: 'Filter by payment plan',
    })
    const statusFilter = page.getByRole('combobox', {
      name: 'Filter by status',
    })

    // Search by student name (a substring shared by every fixture student)
    await search.fill(FIXTURE_QUERY)
    await expect(
      page.getByRole('row', { name: new RegExp(searchLastName) }),
    ).toBeVisible()
    await expect(
      page.getByRole('row', { name: new RegExp(noPlanLastName) }),
    ).toBeVisible()
    await expect(
      page.getByRole('row', { name: new RegExp(conflictLastName) }),
    ).toBeVisible()
    await expect(
      page.getByRole('row', { name: new RegExp(priorOwedLastName) }),
    ).toBeVisible()
    await expect(page.getByText(/^Showing 4 of \d+ students$/)).toBeVisible()

    // Search by exact student name
    await search.fill(searchLastName)
    await expect(
      page.getByRole('row', { name: new RegExp(searchLastName) }),
    ).toBeVisible()
    await expect(
      page.getByRole('row', { name: new RegExp(noPlanLastName) }),
    ).toHaveCount(0)
    await expect(page.getByText(/^Showing 1 of \d+ students$/)).toBeVisible()

    // Search by student code
    await search.fill(studentCode)
    await expect(
      page.getByRole('row', { name: new RegExp(searchLastName) }),
    ).toBeVisible()
    await expect(page.getByText(/^Showing 1 of \d+ students$/)).toBeVisible()

    // Filter by class, scoped to the fixture students with the shared search
    // still active — classAName is a brand-new class only this test's
    // students are enrolled in, so this also works unscoped, but keeping the
    // search active matches how an admin would narrow a real search.
    await search.fill(FIXTURE_QUERY)
    await classFilter.selectOption({ label: classAName })
    await expect(
      page.getByRole('row', { name: new RegExp(searchLastName) }),
    ).toBeVisible()
    await expect(
      page.getByRole('row', { name: new RegExp(conflictLastName) }),
    ).toBeVisible()
    await expect(
      page.getByRole('row', { name: new RegExp(noPlanLastName) }),
    ).toHaveCount(0)
    await expect(page.getByText(/^Showing 2 of \d+ students$/)).toBeVisible()
    await classFilter.selectOption('')

    // Filter by payment plan
    await planFilter.selectOption('monthly')
    await expect(
      page.getByRole('row', { name: new RegExp(searchLastName) }),
    ).toBeVisible()
    await expect(page.getByText(/^Showing 1 of \d+ students$/)).toBeVisible()

    await planFilter.selectOption({ label: 'No payment plan' })
    await expect(
      page.getByRole('row', { name: new RegExp(noPlanLastName) }),
    ).toBeVisible()
    await expect(
      page.getByRole('row', { name: new RegExp(conflictLastName) }),
    ).toBeVisible()
    await expect(
      page.getByRole('row', { name: new RegExp(priorOwedLastName) }),
    ).toBeVisible()
    await expect(
      page.getByRole('row', { name: new RegExp(searchLastName) }),
    ).toHaveCount(0)
    await expect(page.getByText(/^Showing 3 of \d+ students$/)).toBeVisible()
    await planFilter.selectOption('')

    // Filter by status: multiple fee plans. classA and classB (and their fee
    // plans) belong only to this test's brand-new academic year, so this
    // filter is exact even without the search box.
    await search.fill('')
    await statusFilter.selectOption({ label: 'Multiple fee plans' })
    await expect(
      page.getByRole('row', { name: new RegExp(conflictLastName) }),
    ).toBeVisible()
    await expect(page.getByText(/^Showing 1 of \d+ students$/)).toBeVisible()
    await statusFilter.selectOption('')

    // Filter by status: owes from previous years. Prior-year balances are
    // computed across every academic year older than this test's, so other
    // students could also owe from a genuinely earlier year — scope with the
    // search box to keep the count exact.
    await search.fill(FIXTURE_QUERY)
    await statusFilter.selectOption({ label: 'Owes from previous years' })
    await expect(
      page.getByRole('row', { name: new RegExp(priorOwedLastName) }),
    ).toBeVisible()
    await expect(page.getByText(/^Showing 1 of \d+ students$/)).toBeVisible()
    await statusFilter.selectOption('')

    await expect(page.getByText(/^Showing 4 of \d+ students$/)).toBeVisible()
  })
})

// Added in phase 4 (plans/shared-grids.md §6): sorting by a numeric column,
// combined with a status filter, against FunctionalGrid rather than the
// pre-migration markup.
test.describe('Finance — Student Fees sorting', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' })

  let suffix: string
  let yearCode: string
  let yearId: string
  let priorYearId: string
  let smallOwedLastName: string
  let largeOwedLastName: string

  test.beforeEach(async ({}, testInfo) => {
    suffix = `${testInfo.project.name}${testInfo.testId.slice(-6)}`.replace(
      /[^a-z0-9]/gi,
      '',
    )
    smallOwedLastName = `E2ESortSmall${suffix}`
    largeOwedLastName = `E2ESortLarge${suffix}`
    priorYearId = SEED_IDS.academicYears.previous

    const year = academicYearForSuffix(suffix)
    yearCode = year.code
    const { data: yearRow, error: yearError } = await db
      .from('academic_years')
      .insert(year)
      .select('id')
      .single()
    if (yearError) throw yearError
    yearId = yearRow.id

    const { data: students, error: studentsError } = await db
      .from('students')
      .insert([
        {
          first_name: 'Fin',
          last_name: smallOwedLastName,
          primary_guardian_id: GUARDIAN_ID,
          address_guardian_id: GUARDIAN_ID,
        },
        {
          first_name: 'Fin',
          last_name: largeOwedLastName,
          primary_guardian_id: GUARDIAN_ID,
          address_guardian_id: GUARDIAN_ID,
        },
      ])
      .select('id, last_name')
    if (studentsError) throw studentsError

    const idFor = (lastName: string): string => {
      const row = students.find((s) => s.last_name === lastName)
      if (!row) throw new Error(`Missing seeded student for ${lastName}`)
      return row.id
    }

    const { error: accountsError } = await db
      .from('student_fee_accounts')
      .insert([
        {
          student_id: idFor(smallOwedLastName),
          academic_year_id: priorYearId,
          payment_plan: 'custom',
          custom_total_amount: 200,
          custom_up_to_date: false,
        },
        {
          student_id: idFor(largeOwedLastName),
          academic_year_id: priorYearId,
          payment_plan: 'custom',
          custom_total_amount: 900,
          custom_up_to_date: false,
        },
      ])
    if (accountsError) throw accountsError
  })

  test.afterEach(async () => {
    await deleteStudentsByLastName(smallOwedLastName)
    await deleteStudentsByLastName(largeOwedLastName)
    await deleteAcademicYearByCode(yearCode)
  })

  test('sorts by Owed (prev. years) within the owes-prior-years filter', async ({
    page,
  }) => {
    await loadWithFreshData(
      page,
      `/finance?tab=students&year=${yearId}`,
      async () => {
        await expect(
          page.getByText(/^Showing \d+ of \d+ students$/),
        ).toBeVisible({ timeout: 3_000 })
      },
    )

    await page
      .getByRole('combobox', { name: 'Filter by status' })
      .selectOption({ label: 'Owes from previous years' })
    await page
      .getByRole('searchbox', { name: 'Search students' })
      .fill('E2ESort')

    const rows = () =>
      page
        .getByRole('row')
        .filter({ hasText: /E2ESort(Small|Large)/ })
        .allTextContents()

    const owedHeader = page.getByRole('columnheader', {
      name: 'Owed (prev. years)',
    })
    const owedButton = page.getByRole('button', { name: 'Owed (prev. years)' })

    // First click sorts ascending (smallest owed first), the second descending.
    await owedButton.click()
    await expect(owedHeader).toHaveAttribute('aria-sort', 'ascending')
    expect((await rows())[0]).toContain(smallOwedLastName)

    await owedButton.click()
    await expect(owedHeader).toHaveAttribute('aria-sort', 'descending')
    expect((await rows())[0]).toContain(largeOwedLastName)
  })
})
