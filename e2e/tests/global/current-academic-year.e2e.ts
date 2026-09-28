import type { Page } from '@playwright/test'

import { test, expect } from '../../fixtures/index'
import {
  db,
  deleteClassByName,
  SEED_IDS,
  setCurrentAcademicYear,
} from '../../fixtures/seed'

// Switching the current academic year changes what every current-year page
// shows, so this file runs in the `global` project: after all the per-role
// projects have finished, one test at a time (see playwright.config.ts).

const PRIOR_CLASS = 'E2EPriorYearClass'
const CURRENT_CODE = '2026-27'
const PRIOR_CODE = '2025-26'

test.describe.serial('Current academic year', () => {
  test.beforeAll(async () => {
    const { error } = await db.from('classes').insert({
      name: PRIOR_CLASS,
      year_group: 'Year 9',
      academic_year_id: SEED_IDS.academicYears.previous,
      teacher_id: SEED_IDS.staff.teacher,
    })
    if (error) throw error
  })

  test.afterAll(async () => {
    await setCurrentAcademicYear(SEED_IDS.academicYears.current)
    await deleteClassByName(PRIOR_CLASS)
  })

  function yearRow(page: Page, code: string) {
    return page.getByRole('row').filter({ hasText: code })
  }

  async function makeCurrent(page: Page, code: string): Promise<void> {
    await page.goto('/admin?tab=academic-years')
    page.once('dialog', (dialog) => dialog.accept())
    await yearRow(page, code)
      .getByRole('button', { name: 'Make current' })
      .click()
    await expect(
      yearRow(page, code).getByText('Current', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(/Failed to set the current academic year/),
    ).toHaveCount(0)
  }

  async function expectCurrentYear(
    page: Page,
    code: string,
    other: string,
  ): Promise<void> {
    // Reloaded, so this is what the database holds, not the table's own state.
    await page.goto('/admin?tab=academic-years')
    await expect(
      yearRow(page, code).getByText('Current', { exact: true }),
    ).toBeVisible()
    await expect(
      yearRow(page, other).getByText('Current', { exact: true }),
    ).toHaveCount(0)
    await expect(
      yearRow(page, other).getByRole('button', { name: 'Make current' }),
    ).toBeVisible()
  }

  test('making last year current switches the current-year pages to it', async ({
    page,
  }) => {
    await page.goto('/classes')
    await expect(
      page.getByRole('cell', { name: 'Alpha', exact: true }).first(),
    ).toBeVisible()
    await expect(
      page.getByRole('cell', { name: PRIOR_CLASS, exact: true }),
    ).toHaveCount(0)

    await makeCurrent(page, PRIOR_CODE)
    await expectCurrentYear(page, PRIOR_CODE, CURRENT_CODE)

    // /classes defaults to the current year.
    await page.goto('/classes')
    await expect(
      page.getByRole('cell', { name: PRIOR_CLASS, exact: true }).first(),
    ).toBeVisible()
    await expect(
      page.getByRole('cell', { name: 'Alpha', exact: true }),
    ).toHaveCount(0)

    // The dashboard counts the current year's active classes.
    await page.goto('/dashboard')
    const classesTile = page.getByRole('link', { name: /Total Classes/ })
    await expect(classesTile).toContainText('1')
  })

  test('making this year current again switches them back', async ({
    page,
  }) => {
    await makeCurrent(page, CURRENT_CODE)
    await expectCurrentYear(page, CURRENT_CODE, PRIOR_CODE)

    await page.goto('/classes')
    await expect(
      page.getByRole('cell', { name: 'Alpha', exact: true }).first(),
    ).toBeVisible()
    await expect(
      page.getByRole('cell', { name: PRIOR_CLASS, exact: true }),
    ).toHaveCount(0)

    await page.goto('/dashboard')
    await expect(
      page.getByRole('link', { name: /Total Classes/ }),
    ).toContainText('3')
  })
})
