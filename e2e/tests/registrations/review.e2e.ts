import { test, expect } from '../../fixtures/index'
import {
  db,
  createRegistrationSubmission,
  deleteRegistrationSubmissionsByChildLastName,
} from '../../fixtures/seed'

// Pin to admin — only admins can approve/reject/delete registrations
test.use({ storageState: 'e2e/.auth/admin.json' })

test.describe('Registration review', () => {
  let suffix: string
  let childLastName: string

  test.beforeEach(({}, testInfo) => {
    suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, '')
    childLastName = ''
  })

  test.afterEach(async () => {
    if (!childLastName) return
    await db.from('students').delete().eq('last_name', childLastName)
    await deleteRegistrationSubmissionsByChildLastName(childLastName)
    await db
      .from('guardians')
      .delete()
      .in('last_name', [
        `Parent${suffix}`,
        `Guardian${suffix}`,
        `Holder${suffix}`,
      ])
  })

  test('a new submission appears in the review inbox', async ({ page }) => {
    childLastName = `ReviewTodo${suffix}`
    const { id } = await createRegistrationSubmission({
      child_last_name: childLastName,
      contact_last_name: `Parent${suffix}`,
      contact_email: `e2e.${suffix}.todo@example.com`,
    })

    // The list page's cached data doesn't see rows inserted directly via this
    // fixture (bypassing the app's own revalidateTag), so check the detail
    // page — which is fetched fresh per id — rather than the shared list.
    await page.goto(`/registrations/${id}`)
    await expect(
      page.getByRole('heading', { name: new RegExp(childLastName) }),
    ).toBeVisible()
    await expect(page.getByText('pending', { exact: true })).toBeVisible()
  })

  test('approves a submission as a new student', async ({ page }) => {
    childLastName = `ReviewNew${suffix}`
    const { id } = await createRegistrationSubmission({
      child_last_name: childLastName,
      contact_last_name: `Parent${suffix}`,
      contact_email: `e2e.${suffix}.new@example.com`,
    })

    await page.goto(`/registrations/${id}`)
    await page.getByRole('button', { name: 'Approve & save student' }).click()
    await page.getByRole('button', { name: 'Approve' }).click()

    await expect(page).toHaveURL(/\/students\/.+\/edit/)

    const { data: submission } = await db
      .from('registration_submissions')
      .select('status, student_id, linked_existing')
      .eq('id', id)
      .single()
    expect(submission?.status).toBe('actioned')
    expect(submission?.student_id).not.toBeNull()
    expect(submission?.linked_existing).toBe(false)

    const { data: student } = await db
      .from('students')
      .select(
        'id, consent_privacy_notice, consent_emergency_first_aid, primary_guardian_id',
      )
      .eq('id', submission!.student_id)
      .single()
    expect(student?.consent_privacy_notice).toBe(true)
    expect(student?.consent_emergency_first_aid).toBe(true)
    expect(student?.primary_guardian_id).not.toBeNull()
  })

  test('links to an existing inactive student on approval', async ({
    page,
  }) => {
    childLastName = `ReviewLink${suffix}`
    const dob = '2019-06-01'

    const { data: guardian } = await db
      .from('guardians')
      .insert({
        first_name: 'Existing',
        last_name: `Guardian${suffix}`,
        phone: '07700 900111',
      })
      .select('id')
      .single()

    const { data: existingStudent } = await db
      .from('students')
      .insert({
        first_name: 'E2E',
        last_name: childLastName,
        date_of_birth: dob,
        address_line_1: 'Old Address',
        city: 'Oldtown',
        postcode: 'OL1 1AA',
        primary_guardian_id: guardian!.id,
        active: false,
      })
      .select('id')
      .single()

    const { id } = await createRegistrationSubmission({
      child_last_name: childLastName,
      date_of_birth: dob,
      contact_last_name: `Parent${suffix}`,
      contact_email: `e2e.${suffix}.link@example.com`,
    })

    await page.goto(`/registrations/${id}`)
    await expect(page.getByText('Possible existing students')).toBeVisible()

    await page.getByRole('button', { name: 'Approve & save student' }).click()
    await page.getByRole('radio', { name: 'Link to existing student' }).click()
    await page.getByRole('button', { name: 'Approve' }).click()

    await expect(page).toHaveURL(`/students/${existingStudent!.id}/edit`)

    const { data: updated } = await db
      .from('students')
      .select('active, address_line_1')
      .eq('id', existingStudent!.id)
      .single()
    expect(updated?.active).toBe(true)
    expect(updated?.address_line_1).toBe('1 Fixture St')

    const { data: submission } = await db
      .from('registration_submissions')
      .select('linked_existing, student_id')
      .eq('id', id)
      .single()
    expect(submission?.linked_existing).toBe(true)
    expect(submission?.student_id).toBe(existingStudent!.id)
  })

  test('shows a readable error and creates nothing when the student code is already in use', async ({
    page,
  }) => {
    childLastName = `ReviewDup${suffix}`
    const dupCode = `E2EDUP${suffix}`.slice(0, 20)

    const { data: guardian } = await db
      .from('guardians')
      .insert({
        first_name: 'Code',
        last_name: `Holder${suffix}`,
        phone: '07700 900222',
      })
      .select('id')
      .single()

    await db.from('students').insert({
      first_name: 'Existing',
      last_name: `Holder${suffix}`,
      student_code: dupCode,
      address_line_1: '1 X St',
      city: 'X',
      postcode: 'X1 1XX',
      primary_guardian_id: guardian!.id,
    })

    const { id } = await createRegistrationSubmission({
      child_last_name: childLastName,
      contact_last_name: `Parent${suffix}`,
      contact_email: `e2e.${suffix}.dup@example.com`,
    })

    await page.goto(`/registrations/${id}`)
    await page.getByRole('button', { name: 'Approve & save student' }).click()
    await page.locator('#approve_student_code').fill(dupCode)
    await page.getByRole('button', { name: 'Approve' }).click()

    await expect(page.getByText(/already in use/)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/registrations/${id}$`))

    const { data: submission } = await db
      .from('registration_submissions')
      .select('status')
      .eq('id', id)
      .single()
    expect(submission?.status).toBe('pending')

    const { data: newStudents } = await db
      .from('students')
      .select('id')
      .eq('last_name', childLastName)
    expect(newStudents).toEqual([])

    await db.from('students').delete().eq('student_code', dupCode)
  })

  test('rejects with a reason, then deletes', async ({ page }) => {
    childLastName = `ReviewReject${suffix}`
    const { id } = await createRegistrationSubmission({
      child_last_name: childLastName,
      contact_last_name: `Parent${suffix}`,
      contact_email: `e2e.${suffix}.reject@example.com`,
    })

    await page.goto(`/registrations/${id}`)
    await page.getByRole('button', { name: 'Reject' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/Reason/).fill('Duplicate')
    await dialog.getByRole('button', { name: 'Reject' }).click()

    await expect(page).toHaveURL(/\/registrations\?status=rejected/)
    await expect(page.getByText(new RegExp(childLastName))).toBeVisible()

    await page.getByText(new RegExp(childLastName)).click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Confirm delete' }).click()

    await expect(page).toHaveURL(/\/registrations\?status=rejected/)
    await expect(page.getByText(new RegExp(childLastName))).not.toBeVisible()

    const { data } = await db
      .from('registration_submissions')
      .select('id')
      .eq('id', id)
    expect(data).toEqual([])
  })

  test('shows a guardian match warning and reuses the guardian on approve', async ({
    page,
  }) => {
    childLastName = `ReviewReuse${suffix}`
    const seedEmail = `e2e.${suffix}.reuse@example.com`

    const { data: seedGuardian } = await db
      .from('guardians')
      .insert({
        first_name: 'Seed',
        last_name: `Guardian${suffix}`,
        phone: '07700 900333',
        email: seedEmail,
        address_line_1: 'Old Guardian Address',
        city: 'Oldtown',
        postcode: 'OL2 2AA',
      })
      .select('id')
      .single()

    const { id } = await createRegistrationSubmission({
      child_last_name: childLastName,
      contact_last_name: `Parent${suffix}`,
      contact_email: seedEmail,
    })

    await page.goto(`/registrations/${id}`)
    await expect(page.getByText(/Matches existing guardian/)).toBeVisible()

    await page.getByRole('button', { name: 'Approve & save student' }).click()
    // "Reuse matching guardian records" is checked by default.
    await page.getByRole('button', { name: 'Approve' }).click()

    await expect(page).toHaveURL(/\/students\/.+\/edit/)

    const { data: submission } = await db
      .from('registration_submissions')
      .select('student_id')
      .eq('id', id)
      .single()

    const { data: student } = await db
      .from('students')
      .select('primary_guardian_id')
      .eq('id', submission!.student_id)
      .single()
    expect(student?.primary_guardian_id).toBe(seedGuardian!.id)

    const { data: updatedGuardian } = await db
      .from('guardians')
      .select('phone, address_line_1')
      .eq('id', seedGuardian!.id)
      .single()
    expect(updatedGuardian?.phone).toBe('07700 900000')
    expect(updatedGuardian?.address_line_1).toBe('1 Fixture St')
  })

  test('creates a new guardian when reuse is unticked despite a match', async ({
    page,
  }) => {
    childLastName = `ReviewNoReuse${suffix}`
    const seedEmail = `e2e.${suffix}.noreuse@example.com`

    const { data: seedGuardian } = await db
      .from('guardians')
      .insert({
        first_name: 'Seed',
        last_name: `Guardian${suffix}`,
        phone: '07700 900444',
        email: seedEmail,
      })
      .select('id')
      .single()

    const { id } = await createRegistrationSubmission({
      child_last_name: childLastName,
      contact_last_name: `Parent${suffix}`,
      contact_email: seedEmail,
    })

    await page.goto(`/registrations/${id}`)
    await expect(page.getByText(/Matches existing guardian/)).toBeVisible()

    await page.getByRole('button', { name: 'Approve & save student' }).click()
    await page
      .getByRole('checkbox', { name: /Reuse matching guardian records/ })
      .uncheck()
    await page.getByRole('button', { name: 'Approve' }).click()

    await expect(page).toHaveURL(/\/students\/.+\/edit/)

    const { data: submission } = await db
      .from('registration_submissions')
      .select('student_id')
      .eq('id', id)
      .single()

    const { data: student } = await db
      .from('students')
      .select('primary_guardian_id')
      .eq('id', submission!.student_id)
      .single()
    expect(student?.primary_guardian_id).not.toBe(seedGuardian!.id)

    await db.from('guardians').delete().eq('id', student!.primary_guardian_id)
  })
})
