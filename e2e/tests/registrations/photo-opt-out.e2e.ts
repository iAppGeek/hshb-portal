import { test, expect } from '../../fixtures/index'
import { db, deletePhotoOptOutsByChildLastName } from '../../fixtures/seed'

test.describe('Photo consent opt-out — public form', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('submits and lands on the success page', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, '')
    const childLastName = `OptOutPublic${suffix}`

    await page.goto('/register/photo-opt-out')
    await page.getByLabel('First name').fill('E2E')
    await page.getByLabel('Last name').fill(childLastName)
    await page.getByLabel('Date of birth').fill('2016-03-10')
    await page.getByLabel('Your full name').fill('E2E Parent')

    const submit = page.getByRole('button', {
      name: 'Withdraw photo consent',
    })
    await expect(submit).toBeEnabled({ timeout: 15000 })
    await submit.click()
    await expect(page).toHaveURL(/\/register\/photo-opt-out\/success/)

    const { data } = await db
      .from('photo_consent_opt_outs')
      .select('status')
      .eq('child_last_name', childLastName)
      .single()
    expect(data?.status).toBe('pending')

    await deletePhotoOptOutsByChildLastName(childLastName)
  })

  test('/register/photo-opt-out shows no staff sidebar', async ({ page }) => {
    await page.goto('/register/photo-opt-out')
    await expect(page.locator('aside')).toHaveCount(0)
  })
})

test.describe('Photo consent opt-out — admin review', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' })

  let childLastName: string

  test.afterEach(async () => {
    if (!childLastName) return
    await db.from('students').delete().eq('last_name', childLastName)
    await deletePhotoOptOutsByChildLastName(childLastName)
    await db
      .from('guardians')
      .delete()
      .eq('last_name', `OptOutGuardian-${childLastName}`)
  })

  test('matches and applies an opt-out request', async ({ page }, testInfo) => {
    const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, '')
    childLastName = `OptOutAdmin${suffix}`
    const dob = '2016-03-10'

    const { data: guardian } = await db
      .from('guardians')
      .insert({
        first_name: 'E2E',
        last_name: `OptOutGuardian-${childLastName}`,
        phone: '07700 900444',
      })
      .select('id')
      .single()

    const { data: student } = await db
      .from('students')
      .insert({
        first_name: 'E2E',
        last_name: childLastName,
        date_of_birth: dob,
        address_line_1: '1 Test St',
        city: 'London',
        postcode: 'N1 1AA',
        primary_guardian_id: guardian!.id,
        consent_photo_media: true,
      })
      .select('id')
      .single()

    // Submit through the real public form (not a direct DB insert) so the
    // request's own revalidateTag call keeps /registrations' cached list
    // fresh — a fixture-inserted row wouldn't trigger that invalidation.
    await page.goto('/register/photo-opt-out')
    await page.getByLabel('First name').fill('E2E')
    await page.getByLabel('Last name').fill(childLastName)
    await page.getByLabel('Date of birth').fill(dob)
    await page.getByLabel('Your full name').fill('E2E Parent')
    const submitOptOut = page.getByRole('button', {
      name: 'Withdraw photo consent',
    })
    await expect(submitOptOut).toBeEnabled({ timeout: 15000 })
    await submitOptOut.click()
    await expect(page).toHaveURL(/\/register\/photo-opt-out\/success/)

    await page.goto('/registrations')
    await expect(page.getByText('Photo consent opt-outs')).toBeVisible()

    // Under heavy test parallelism, many workers race to invalidate/recompute
    // the shared cached list at once, so a worker's own just-submitted row
    // can briefly be missing from a fresh load. Also, in dev mode a click
    // right after reload can occasionally land before the row has finished
    // hydrating, silently dropping it. Retry the whole reload-then-click
    // cycle — a fresh reload gives hydration another full attempt — rather
    // than re-clicking the same possibly-stuck DOM node.
    const row = page.locator('tr', { hasText: childLastName })
    const dialog = page.getByRole('dialog')
    await expect(async () => {
      await page.reload()
      await expect(
        row.getByRole('button', { name: 'Match & apply' }),
      ).toBeVisible({ timeout: 2000 })
      await page.waitForLoadState('networkidle')
      await row.getByRole('button', { name: 'Match & apply' }).click()
      await expect(
        dialog.getByRole('heading', { name: 'Match to a student' }),
      ).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 45000 })
    await expect(
      dialog.getByText(new RegExp(`Selected:.*${childLastName}`)),
    ).toBeVisible()

    // The dialog stays on /registrations throughout (it's a modal, not a
    // navigation), so the only reliable signal that Apply actually went
    // through is the dialog closing — same hydration-timing risk as the
    // Match & apply click above, so retry the click too.
    await expect(async () => {
      await dialog.getByRole('button', { name: 'Apply opt-out' }).click()
      await expect(dialog).toBeHidden({ timeout: 3000 })
    }).toPass({ timeout: 15000 })

    // The dialog closing confirms the redirect fired, but the DB write it
    // triggered can still be a beat behind this test's own read — poll
    // rather than asserting on a single, possibly-too-early read.
    await expect(async () => {
      const { data: updated } = await db
        .from('students')
        .select('consent_photo_media')
        .eq('id', student!.id)
        .single()
      expect(updated?.consent_photo_media).toBe(false)
    }).toPass({ timeout: 5000 })

    const { data: request } = await db
      .from('photo_consent_opt_outs')
      .select('status, student_id')
      .eq('child_last_name', childLastName)
      .single()
    expect(request?.status).toBe('actioned')
    expect(request?.student_id).toBe(student!.id)
  })
})
