import { test, expect } from '../../fixtures/index'

test.describe('Dashboard Linktree tile', () => {
  test('every role can share the website linktree from a QR code modal', async ({
    page,
  }) => {
    await page.goto('/dashboard')

    await page.getByRole('button', { name: /linktree/i }).click()

    const dialog = page.getByTestId('linktree-dialog')
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('img', { name: 'QR code for the Linktree' }),
    ).toBeVisible()
    // Test accounts are not @hshb.org.uk, so the link is not personalised.
    await expect(
      dialog.getByText('https://www.hshb.org.uk/linktree'),
    ).toBeVisible()

    const link = dialog.getByRole('link', { name: /open linktree/i })
    await expect(link).toHaveAttribute(
      'href',
      'https://www.hshb.org.uk/linktree',
    )
    await expect(link).toHaveAttribute('target', '_blank')

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()
  })
})
