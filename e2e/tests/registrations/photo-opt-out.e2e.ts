import { test, expect } from '../../fixtures/index'
import {
  db,
  createPhotoOptOut,
  deletePhotoOptOutsByChildLastName,
} from '../../fixtures/seed'

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
    // test covers the parent-facing flow end to end.
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

    const { data: submitted } = await db
      .from('photo_consent_opt_outs')
      .select('id')
      .eq('child_last_name', childLastName)
      .single()

    // The request is listed on the opt-outs tab and links to its review page.
    // In dev mode a click right after load can land before hydration and be
    // dropped, so retry the load-then-click cycle rather than the click.
    const row = page.locator('tr', { hasText: childLastName })
    await expect(async () => {
      await page.goto('/registrations?tab=photo-opt-outs')
      await row.getByRole('link', { name: 'Review' }).click({ timeout: 2000 })
      await expect(page).toHaveURL(
        `/registrations/photo-opt-outs/${submitted!.id}`,
        { timeout: 3000 },
      )
    }).toPass({ timeout: 45000 })

    const dialog = page.getByTestId('match-student-dialog')
    await expect(async () => {
      await page.getByRole('button', { name: 'Match & apply' }).click()
      await expect(
        dialog.getByRole('heading', { name: 'Match to a student' }),
      ).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 45000 })
    await expect(
      dialog.getByText(new RegExp(`Selected:.*${childLastName}`)),
    ).toBeVisible()
    // Applying an opt-out needs an existing student: there is no create path.
    await expect(
      dialog.getByRole('radio', { name: 'Create new student' }),
    ).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Apply opt-out' }).click()
    await expect(page).toHaveURL(/\/registrations\?tab=photo-opt-outs$/)

    // The redirect confirms the action returned, but the DB write it
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

  test('rejects an opt-out request through the shared reason dialog', async ({
    page,
  }, testInfo) => {
    const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, '')
    childLastName = `OptOutReject${suffix}`
    const { id } = await createPhotoOptOut(childLastName)

    await page.goto(`/registrations/photo-opt-outs/${id}`)
    await expect(
      page.getByRole('heading', { name: new RegExp(childLastName) }),
    ).toBeVisible()

    const dialog = page.getByTestId('reason-dialog')
    await expect(async () => {
      await page.getByRole('button', { name: 'Reject' }).click()
      await expect(dialog).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 45000 })
    await dialog.getByLabel(/Reason/).fill('Cannot match to a student')
    await dialog.getByRole('button', { name: 'Reject' }).click()

    await expect(page).toHaveURL(/\/registrations\?tab=photo-opt-outs$/)

    const { data: rejected } = await db
      .from('photo_consent_opt_outs')
      .select('status, rejected_reason, actioned_by, actioned_at')
      .eq('id', id)
      .single()
    expect(rejected?.status).toBe('rejected')
    expect(rejected?.rejected_reason).toBe('Cannot match to a student')
    expect(rejected?.actioned_by).not.toBeNull()
    expect(rejected?.actioned_at).not.toBeNull()

    await expect(async () => {
      const { data: audit } = await db
        .from('audit_log')
        .select('details')
        .eq('action', 'photo_opt_out_rejected')
        .eq('entity_id', id)
        .single()
      expect(audit?.details).toEqual({ reason: 'Cannot match to a student' })
    }).toPass({ timeout: 5000 })
  })

  test('deletes an opt-out request through the confirm dialog', async ({
    page,
  }, testInfo) => {
    const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, '')
    childLastName = `OptOutDelete${suffix}`
    const { id } = await createPhotoOptOut(childLastName)

    await page.goto(`/registrations/photo-opt-outs/${id}`)
    const dialog = page.getByTestId('confirm-dialog')
    await expect(async () => {
      await page.getByRole('button', { name: 'Delete' }).click()
      await expect(dialog).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 45000 })
    await expect(
      dialog.getByText(/Delete this opt-out request permanently/),
    ).toBeVisible()
    await dialog.getByRole('button', { name: 'Confirm delete' }).click()

    await expect(page).toHaveURL(/\/registrations\?tab=photo-opt-outs$/)

    const { data } = await db
      .from('photo_consent_opt_outs')
      .select('id')
      .eq('id', id)
    expect(data).toEqual([])

    await expect(async () => {
      const { data: audit } = await db
        .from('audit_log')
        .select('action')
        .eq('action', 'photo_opt_out_deleted')
        .eq('entity_id', id)
      expect(audit).toHaveLength(1)
    }).toPass({ timeout: 5000 })
  })

  test('shows the not-found page for an unknown opt-out id', async ({
    page,
  }) => {
    childLastName = ''
    await page.goto(
      '/registrations/photo-opt-outs/00000000-0000-0000-0000-000000000000',
    )
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  })
})
