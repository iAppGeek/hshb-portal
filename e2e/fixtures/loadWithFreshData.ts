import type { Page } from '@playwright/test'

import { expect } from './index'

// Fixture rows bypass the app's cache invalidation. Refresh and reload until
// they show, since a parallel test can repopulate a shared cache between this
// test's insert and its refresh.
export async function loadWithFreshData(
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
