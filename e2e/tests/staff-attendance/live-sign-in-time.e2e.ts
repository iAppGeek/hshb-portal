import type { Locator, Page } from '@playwright/test'

import { test, expect } from '../../fixtures/index'
import { loadWithFreshData } from '../../fixtures/loadWithFreshData'
import { db, deleteStaffByEmail } from '../../fixtures/seed'

// The reception tablet: an admin keeps today's sheet open while staff arrive.
test.use({ storageState: 'e2e/.auth/admin.json' })
test.describe.configure({ timeout: 90_000 })

const CHIP = /^Time \d{2}:\d{2}, double-click to change$/

/** The browser's (faked) London wall-clock time as `HH:MM`. */
function londonTime(page: Page): Promise<string> {
  return page.evaluate(() =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date()),
  )
}

test.describe('Staff sign-in time', () => {
  let staffEmail: string
  let lastName: string
  let row: Locator

  test.beforeEach(async ({ page }, testInfo) => {
    // Tests run fully parallel, so names must be unique per test as well as
    // per project, or one test's cleanup deletes another's fixtures.
    const suffix =
      `${testInfo.project.name}${testInfo.testId.slice(-6)}`.replace(
        /[^a-z0-9]/gi,
        '',
      )
    staffEmail = `e2e.signin.${suffix.toLowerCase()}@test.hshb.local`
    lastName = `E2ESignIn${suffix}`

    const { error } = await db.from('staff').insert({
      title: 'Ms',
      first_name: 'Signin',
      last_name: lastName,
      email: staffEmail,
      role: 'teacher',
    })
    if (error) throw error

    await page.clock.install()
    row = page.getByRole('row').filter({ hasText: lastName })
    await loadWithFreshData(page, '/staff-attendance', async () => {
      await expect(row.getByRole('button', { name: CHIP })).toBeVisible()
    })
  })

  test.afterEach(async () => {
    // Cascades to the staff member's attendance rows.
    await deleteStaffByEmail(staffEmail)
  })

  test('keeps the time up to date while the page is left open', async ({
    page,
  }) => {
    // The chip is server-rendered, so it shows before hydration starts the
    // clock; each attempt moves the clock on again until a tick lands.
    await expect(async () => {
      await page.clock.fastForward('01:00')
      const expected = await londonTime(page)
      await expect(
        row.getByRole('button', {
          name: `Time ${expected}, double-click to change`,
        }),
      ).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
  })

  test('records the time of the tap', async ({ page }) => {
    // Freeze the clock so the time can't roll over between reading and
    // tapping, and wait for the chip to catch up: proof the row has hydrated.
    const browserNow = await page.evaluate(() => Date.now())
    await page.clock.pauseAt(browserNow + 2 * 60_000)
    await expect(async () => {
      await page.clock.runFor(60_000)
      const shown = await londonTime(page)
      await expect(
        row.getByRole('button', {
          name: `Time ${shown}, double-click to change`,
        }),
      ).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    const expected = await londonTime(page)

    await row.getByRole('button', { name: 'Sign In' }).click()

    await expect(row).toContainText(`Signed In ${expected}`)
    await expect(row.getByRole('button', { name: 'Sign Out' })).toBeVisible()
  })

  test('records a time set by hand after a double-click', async () => {
    // A double-click before hydration does nothing, so retry until it opens.
    await expect(async () => {
      await row.getByRole('button', { name: CHIP }).dblclick()
      await expect(row.getByLabel('Time')).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    await row.getByLabel('Time').fill('07:45')
    await row.getByRole('button', { name: 'Sign In' }).click()

    await expect(row).toContainText('Signed In 07:45')
    // Back to the live clock for signing out.
    await expect(row.getByRole('button', { name: CHIP })).toBeVisible()
  })
})
