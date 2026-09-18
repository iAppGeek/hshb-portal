import { test, expect } from '../../fixtures/index'
import { loadWithFreshData } from '../../fixtures/loadWithFreshData'
import { db, deleteStudentsByLastName } from '../../fixtures/seed'

// Students is visible to every role; sorting only needs one to exercise it.
test.use({ storageState: 'e2e/.auth/admin.json' })

// Guardian seed ID from supabase/seed.sql
const GUARDIAN_ID = '20000000-0000-0000-0000-000000000001'

test.describe('Students — sorting', () => {
  let suffix: string
  let alphaLastName: string
  let zuluLastName: string

  test.beforeEach(async ({}, testInfo) => {
    suffix = `${testInfo.project.name}${testInfo.testId.slice(-6)}`.replace(
      /[^a-z0-9]/gi,
      '',
    )
    // "Alpha"/"Zulu" prefixes keep these two names in a predictable order
    // relative to each other regardless of what else is seeded.
    alphaLastName = `E2ESortAlpha${suffix}`
    zuluLastName = `E2ESortZulu${suffix}`

    const { error } = await db.from('students').insert([
      {
        first_name: 'Ann',
        last_name: alphaLastName,
        primary_guardian_id: GUARDIAN_ID,
        address_guardian_id: GUARDIAN_ID,
      },
      {
        first_name: 'Zoe',
        last_name: zuluLastName,
        primary_guardian_id: GUARDIAN_ID,
        address_guardian_id: GUARDIAN_ID,
      },
    ])
    if (error) throw error
  })

  test.afterEach(async () => {
    await deleteStudentsByLastName(alphaLastName)
    await deleteStudentsByLastName(zuluLastName)
  })

  // Compares document order, not row roles — a stacked mobile row is a `<tr
  // class="block …">`, and relying on `getByRole('row')` ordering would tie
  // this test to how reliably browsers keep table-row semantics under
  // `display: block`, which this test does not need to depend on.
  async function orderOf(
    page: import('@playwright/test').Page,
  ): Promise<[string, string]> {
    const text = await page.locator('table').first().innerText()
    const alphaIndex = text.indexOf(alphaLastName)
    const zuluIndex = text.indexOf(zuluLastName)
    expect(alphaIndex).toBeGreaterThanOrEqual(0)
    expect(zuluIndex).toBeGreaterThanOrEqual(0)
    return alphaIndex < zuluIndex
      ? [alphaLastName, zuluLastName]
      : [zuluLastName, alphaLastName]
  }

  test('sorts by name ascending by default, and toggles on header click (desktop)', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'desktop-only: exercises the clickable column header')

    await loadWithFreshData(page, isMobile, '/students', async () => {
      // Stacked mode's mobile summary title duplicates the desktop name
      // cell, so this text appears twice — see `orderOf` below.
      await expect(
        page
          .getByText(`${alphaLastName}, Ann`)
          .filter({ visible: true })
          .first(),
      ).toBeVisible({ timeout: 3_000 })
    })

    expect(await orderOf(page)).toEqual([alphaLastName, zuluLastName])

    // The header toggles ascending ↔ descending and never clears the sort.
    const nameHeader = page.getByRole('button', { name: 'Name' })
    await nameHeader.click()
    await expect(
      page.getByRole('columnheader', { name: 'Name' }),
    ).toHaveAttribute('aria-sort', 'descending')
    expect(await orderOf(page)).toEqual([zuluLastName, alphaLastName])

    await nameHeader.click()
    await expect(
      page.getByRole('columnheader', { name: 'Name' }),
    ).toHaveAttribute('aria-sort', 'ascending')
    expect(await orderOf(page)).toEqual([alphaLastName, zuluLastName])
  })

  test('sorts using the "Sort by" control on mobile', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'mobile-only: exercises the "Sort by" select')

    await loadWithFreshData(page, isMobile, '/students', async () => {
      await expect(
        page
          .getByText(`${alphaLastName}, Ann`)
          .filter({ visible: true })
          .first(),
      ).toBeVisible({ timeout: 3_000 })
    })

    expect(await orderOf(page)).toEqual([alphaLastName, zuluLastName])

    await page
      .getByRole('combobox', { name: 'Sort by' })
      .selectOption('name:desc')

    expect(await orderOf(page)).toEqual([zuluLastName, alphaLastName])
  })
})
