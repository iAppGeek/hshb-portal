import { test, expect } from '../../fixtures/index'
import { db } from '../../fixtures/seed'

// Only admins can manage documents today.
test.use({ storageState: 'e2e/.auth/admin.json' })

// Seeded owners from supabase/seed.sql
const STUDENT_ID = '30000000-0000-0000-0000-000000000001' // Alice Student
const STAFF_ID = '00000000-0000-0000-0000-000000000002' // Tom Teacher

const LINK_NAME = 'E2E Link Doc'
const RECORD_NAME = 'E2E Record Doc'

test.describe('Documents & Records', () => {
  test.afterEach(async () => {
    // Hard-remove anything this spec created (link/record docs are backend-free).
    await db.from('documents').delete().like('name', 'E2E %')
  })

  test('admin can add, edit and soft-delete documents on a student', async ({
    page,
  }) => {
    await page.goto(`/students/${STUDENT_ID}/edit`)
    const section = page.getByTestId('documents-section')

    // Seeded link document is visible
    await expect(section.getByText('Consent form')).toBeVisible()

    // ── Add a link document ───────────────────────────────────────────────
    await section.getByText('+ Add document or record').click()
    await section.getByRole('combobox').selectOption('medical_consent')
    await section.locator('input[name="name"]').fill(LINK_NAME)
    await section.getByLabel('Never').check()
    await section.getByLabel('Paste link').check()
    await section.getByLabel('Link URL').fill('https://example.com/e2e.pdf')
    await section.getByRole('button', { name: 'Add' }).click()
    await expect(section.getByText(LINK_NAME)).toBeVisible()

    // View link points at the download route
    const viewLink = section
      .locator('tr', { hasText: LINK_NAME })
      .getByRole('link', { name: /View/ })
    await expect(viewLink).toHaveAttribute(
      'href',
      /\/api\/documents\/.*\/download/,
    )

    // ── Add a record ──────────────────────────────────────────────────────
    await section.getByText('+ Add document or record').click()
    await section.getByRole('combobox').selectOption('dbs_check')
    await section.locator('input[name="name"]').fill(RECORD_NAME)
    await section.getByLabel('Never').check()
    await section.getByLabel('Field 1 value').fill('E2E-123')
    await section.getByRole('button', { name: 'Add' }).click()
    await expect(section.getByText(RECORD_NAME)).toBeVisible()
    await expect(section.getByText('Certificate No:')).toBeVisible()
    // Records have no View link
    await expect(
      section
        .locator('tr', { hasText: RECORD_NAME })
        .getByRole('link', { name: /View/ }),
    ).toHaveCount(0)

    // ── Rows are read-only until Edit; edit the link doc's name ───────────
    const linkRow = section.locator('tr', { hasText: LINK_NAME })
    await linkRow.getByRole('button', { name: 'Edit' }).click()
    await section.locator('input[name="name"]').fill(`${LINK_NAME} v2`)
    await section.getByRole('button', { name: 'Save' }).click()
    await expect(section.getByText(`${LINK_NAME} v2`)).toBeVisible()

    // ── Delete the record via the confirmation dialog ─────────────────────
    await section
      .locator('tr', { hasText: RECORD_NAME })
      .getByRole('button', { name: 'Delete' })
      .click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Confirm' }).click()
    await expect(section.getByText(RECORD_NAME)).toHaveCount(0)

    // ── Soft delete is retained on the deleted-documents page ─────────────
    await page.goto('/documents/deleted')
    await expect(page.getByText(RECORD_NAME)).toBeVisible()
  })

  test('documents section is visible on a staff record', async ({ page }) => {
    await page.goto(`/staff/${STAFF_ID}/edit`)
    const section = page.getByTestId('documents-section')
    await expect(section.getByText('Teaching contract')).toBeVisible()
    await expect(section.getByText('DBS')).toBeVisible()
  })
})
