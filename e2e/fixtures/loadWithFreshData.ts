import type { Page } from '@playwright/test'

// Pages read straight from the database, so a fixture row inserted directly
// shows on the next load. `ready` asserts the page has what the test needs.
export async function loadWithFreshData(
  page: Page,
  path: string,
  ready: () => Promise<void>,
): Promise<void> {
  await page.goto(path)
  await ready()
}
