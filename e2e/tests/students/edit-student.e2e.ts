import { test, expect } from '../../fixtures/index'
import { db } from '../../fixtures/seed'

// Pin to admin — only admins can edit students
test.use({ storageState: 'e2e/.auth/admin.json' })

test.describe('Edit student', () => {
  let lastName: string
  let studentId: string

  test.beforeEach(async ({}, testInfo) => {
    // Unique per test, not just per project: the tests here run in parallel
    // and afterEach deletes by last name, so a shared name let the quick
    // not-found test delete the student the save test was still editing.
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    lastName = `EditStudent${suffix}`

    const { data: guardian, error: guardianError } = await db
      .from('guardians')
      .insert({
        first_name: 'E2E',
        last_name: `Parent${lastName}`,
        phone: '07700 900000',
      })
      .select('id')
      .single()
    if (guardianError) throw guardianError

    const { data: student, error: studentError } = await db
      .from('students')
      .insert({
        first_name: 'Before',
        last_name: lastName,
        address_line_1: '1 Test St',
        city: 'London',
        postcode: 'N1 1AA',
        primary_guardian_id: guardian.id,
        primary_guardian_relationship: 'Mother',
      })
      .select('id')
      .single()
    if (studentError) throw studentError
    studentId = student.id
  })

  test.afterEach(async () => {
    await db.from('students').delete().eq('last_name', lastName)
    await db.from('guardians').delete().eq('last_name', `Parent${lastName}`)
  })

  test('shows the saved changes without reloading', async ({ page }) => {
    // Load the edit page before the save
    await page.goto(`/students/${studentId}/edit`)
    const firstName = page.locator('input[name="student_first_name"]')
    await expect(firstName).toHaveValue('Before')

    await firstName.fill('After')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page).toHaveURL('/students')
    // Stacked mode's mobile summary title duplicates the desktop name cell,
    // and only one of the two is visible at a given viewport.
    await expect(
      page.getByText(`${lastName}, After`).filter({ visible: true }).first(),
    ).toBeVisible()

    await page.goto(`/students/${studentId}/edit`)
    await expect(page.locator('input[name="student_first_name"]')).toHaveValue(
      'After',
    )
  })

  test('shows the not-found page for a student that does not exist', async ({
    page,
  }) => {
    await page.goto('/students/00000000-0000-0000-0000-000000000000/edit')
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  })
})
