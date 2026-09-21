import { test, expect } from '../../fixtures/index'
import { db } from '../../fixtures/seed'

// Pin to admin — only admins can create students
test.use({ storageState: 'e2e/.auth/admin.json' })

const STUDENT_FIRST = 'E2ETest'
const STUDENT_LAST = 'GuardianAddress'
const GUARDIAN_FIRST = 'E2EGuardian'
const GUARDIAN_LAST = 'AddrTest'

// Distinct from the pair above: this student is never expected to save, but
// uses its own name so a run where validation regresses (and a row is
// created) can't collide with, or be masked by, the other test's cleanup.
const INVALID_STUDENT_FIRST = 'E2ETestInvalid'
const INVALID_STUDENT_LAST = 'GuardianEmail'
const INVALID_GUARDIAN_FIRST = 'E2EGuardianInvalid'
const INVALID_GUARDIAN_LAST = 'EmailTest'

// Serial: the two tests share a dev-mode Next.js server, and running them
// concurrently under Turbopack's on-demand compilation was slow enough to
// occasionally miss the 5s toBeVisible() timeout below.
test.describe.serial('Add student', () => {
  test.afterEach(async () => {
    await db
      .from('students')
      .delete()
      .eq('first_name', STUDENT_FIRST)
      .eq('last_name', STUDENT_LAST)
    await db
      .from('guardians')
      .delete()
      .eq('first_name', GUARDIAN_FIRST)
      .eq('last_name', GUARDIAN_LAST)
    await db
      .from('students')
      .delete()
      .eq('first_name', INVALID_STUDENT_FIRST)
      .eq('last_name', INVALID_STUDENT_LAST)
    await db
      .from('guardians')
      .delete()
      .eq('first_name', INVALID_GUARDIAN_FIRST)
      .eq('last_name', INVALID_GUARDIAN_LAST)
  })

  test('creates student with address inherited from primary guardian', async ({
    page,
  }) => {
    await page.goto('/students/new')

    // Student details
    await page.locator('input[name="student_first_name"]').fill(STUDENT_FIRST)
    await page.locator('input[name="student_last_name"]').fill(STUDENT_LAST)

    // Address mode defaults to "Same as guardian" (primary) — no interaction needed

    // Primary guardian (new)
    await page.locator('input[name="primary_first_name"]').fill(GUARDIAN_FIRST)
    await page.locator('input[name="primary_last_name"]').fill(GUARDIAN_LAST)
    await page.locator('input[name="primary_phone"]').fill('07700 900999')
    await page
      .locator('input[name="primary_email"]')
      .fill('e2e@test.hshb.local')
    await page.locator('input[name="primary_relationship"]').fill('Mother')
    await page.locator('input[name="primary_occupation"]').fill('Pharmacist')
    await page
      .locator('input[name="primary_address_line_1"]')
      .fill('1 Test Street')
    await page.locator('input[name="primary_city"]').fill('London')
    await page.locator('input[name="primary_postcode"]').fill('EC1A 1BB')

    await page.getByRole('button', { name: 'Save student' }).click()

    await expect(page).toHaveURL('/students')
    // Parallel projects add a student with the same name, so match any row.
    // Stacked mode's mobile summary title also duplicates the desktop name
    // cell, and only one of the two is visible at a given viewport.
    await expect(
      page
        .getByText(`${STUDENT_LAST}, ${STUDENT_FIRST}`)
        .filter({ visible: true })
        .first(),
    ).toBeVisible()

    // Verify student was saved with address_guardian_id set and own address null
    const { data: student } = await db
      .from('students')
      .select('address_guardian_id, address_line_1, english_school_name')
      .eq('first_name', STUDENT_FIRST)
      .eq('last_name', STUDENT_LAST)
      .single()

    expect(student?.address_guardian_id).not.toBeNull()
    expect(student?.address_line_1).toBeNull()
    // Optional for admin data entry, unlike the public registration form.
    expect(student?.english_school_name).toBeNull()

    const { data: guardian } = await db
      .from('guardians')
      .select('occupation')
      .eq('id', student?.address_guardian_id ?? '')
      .single()
    expect(guardian?.occupation).toBe('Pharmacist')
  })

  test('shows a field-level error under the primary guardian email on an invalid address', async ({
    page,
  }) => {
    await page.goto('/students/new')

    await page
      .locator('input[name="student_first_name"]')
      .fill(INVALID_STUDENT_FIRST)
    await page
      .locator('input[name="student_last_name"]')
      .fill(INVALID_STUDENT_LAST)
    await page
      .locator('input[name="primary_first_name"]')
      .fill(INVALID_GUARDIAN_FIRST)
    await page
      .locator('input[name="primary_last_name"]')
      .fill(INVALID_GUARDIAN_LAST)
    await page.locator('input[name="primary_phone"]').fill('07700 900999')
    // No TLD: passes the browser's native type="email" constraint (so the
    // form actually submits) but fails the server's stricter Zod regex,
    // exercising the server-side fieldErrors path rather than native
    // validation UI.
    await page.locator('input[name="primary_email"]').fill('person@localhost')
    await page.locator('input[name="primary_relationship"]').fill('Mother')
    await page.locator('input[name="primary_occupation"]').fill('Pharmacist')
    await page
      .locator('input[name="primary_address_line_1"]')
      .fill('1 Test Street')
    await page.locator('input[name="primary_city"]').fill('London')
    await page.locator('input[name="primary_postcode"]').fill('EC1A 1BB')

    await page.getByRole('button', { name: 'Save student' }).click()

    // The action rejects and the page never navigates away.
    await expect(page).toHaveURL(/\/students\/new$/)

    const emailField = page.locator('input[name="primary_email"]')
    await expect(emailField).toHaveAttribute('aria-invalid', 'true')
    await expect(emailField).toBeInViewport()

    const errorId = await emailField.getAttribute('aria-describedby')
    expect(errorId).toBeTruthy()
    await expect(page.locator(`#${errorId}`)).toBeVisible()
  })
})
