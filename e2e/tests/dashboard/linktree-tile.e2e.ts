import { test, expect } from '../../fixtures/index'

test.describe('Dashboard Linktree tile', () => {
  test('every role can open the website linktree in a new tab', async ({
    page,
  }) => {
    await page.goto('/dashboard')

    const tile = page.getByRole('link', { name: /linktree/i })
    await expect(tile).toBeVisible()
    // Test accounts are not @hshb.org.uk, so the link is not personalised.
    await expect(tile).toHaveAttribute(
      'href',
      'https://www.hshb.org.uk/linktree',
    )
    await expect(tile).toHaveAttribute('target', '_blank')
  })
})
