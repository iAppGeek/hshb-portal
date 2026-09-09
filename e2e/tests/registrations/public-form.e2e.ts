import { test, expect } from '@playwright/test'

import {
  db,
  deleteRegistrationSubmissionsByChildLastName,
} from '../../fixtures/seed'

// Clear storageState so all tests in this file run as unauthenticated,
// like login.e2e.ts.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Public registration form', () => {
  test.describe('happy path', () => {
    let childLastName: string

    test.beforeEach(({}, testInfo) => {
      childLastName = `Fixture-${testInfo.project.name.replace(/[^a-z0-9]/gi, '')}`
    })

    test.afterEach(async () => {
      await deleteRegistrationSubmissionsByChildLastName(childLastName)
    })

    test('submits a registration and redirects to the success page', async ({
      page,
    }) => {
      await page.goto('/register')

      await page.getByLabel('First name').first().fill('Petra')
      await page.getByLabel('Last name').first().fill(childLastName)
      await page.getByLabel('Date of birth').fill('2020-01-15')
      await page
        .locator('input[name="english_school_name"]')
        .fill('St Marys Primary')
      await page.getByLabel('Address line 1').fill('1 Test Street')
      await page.getByLabel('City').fill('London')
      await page.getByLabel('Postcode').fill('N1 1AA')

      await page.getByLabel('First name').nth(1).fill('Gary')
      await page.getByLabel('Last name').nth(1).fill('Guardian')
      await page.getByLabel('Phone').fill('07700 900000')
      await page.locator('input[name="primary_occupation"]').fill('Bus driver')

      await page.getByLabel(/I have read and accept the school's/).check()
      await page.getByLabel(/I consent to emergency first aid/).check()

      await page.getByLabel('Your full name').fill('Gary Guardian')

      const submit = page.getByRole('button', { name: 'Submit registration' })
      // Cloudflare's test site key auto-resolves without interaction.
      await expect(submit).toBeEnabled({ timeout: 15000 })
      await submit.click()

      await expect(page).toHaveURL(/\/register\/success/)

      const { data } = await db
        .from('registration_submissions')
        .select(
          'id, child_last_name, english_school_name, registration_submission_contacts(contact_role, occupation)',
        )
        .eq('child_last_name', childLastName)
        .single()
      expect(data).not.toBeNull()
      expect(data?.english_school_name).toBe('St Marys Primary')
      expect(data?.registration_submission_contacts).toHaveLength(1)
      expect(data?.registration_submission_contacts[0].contact_role).toBe(
        'primary',
      )
      expect(data?.registration_submission_contacts[0].occupation).toBe(
        'Bus driver',
      )
    })
  })

  test.describe('optional contacts', () => {
    let childLastName: string

    test.beforeEach(({}, testInfo) => {
      childLastName = `Fixture-Contacts-${testInfo.project.name.replace(/[^a-z0-9]/gi, '')}`
    })

    test.afterEach(async () => {
      await deleteRegistrationSubmissionsByChildLastName(childLastName)
    })

    test('adding a second parent/carer and emergency contact submits them alongside the primary contact', async ({
      page,
    }) => {
      await page.goto('/register')

      await page.getByLabel('First name').first().fill('Petra')
      await page.getByLabel('Last name').first().fill(childLastName)
      await page.getByLabel('Date of birth').fill('2020-01-15')
      await page
        .locator('input[name="english_school_name"]')
        .fill('St Marys Primary')
      await page.getByLabel('Address line 1').fill('1 Test Street')
      await page.getByLabel('City').fill('London')
      await page.getByLabel('Postcode').fill('N1 1AA')

      await page.getByLabel('First name').nth(1).fill('Gary')
      await page.getByLabel('Last name').nth(1).fill('Guardian')
      await page.getByLabel('Phone').first().fill('07700 900000')
      await page.locator('input[name="primary_occupation"]').fill('Bus driver')

      await page
        .getByRole('button', { name: '+ Add a second parent/carer' })
        .click()
      await expect(page.getByText('Parent/carer 2')).toBeVisible()
      await page.getByLabel('First name').nth(2).fill('Gina')
      await page.getByLabel('Last name').nth(2).fill('Guardian')
      await page.getByLabel('Phone').nth(1).fill('07700 900001')
      await page
        .locator('input[name="secondary_occupation"]')
        .fill('Pharmacist')

      await page
        .getByRole('button', { name: '+ Add an emergency contact' })
        .click()
      await expect(page.getByText('Emergency contact 1')).toBeVisible()
      await page.getByLabel('First name').nth(3).fill('Eddie')
      await page.getByLabel('Last name').nth(3).fill('Emergency')
      await page.getByLabel('Phone').nth(2).fill('07700 900002')

      await page.getByLabel(/I have read and accept the school's/).check()
      await page.getByLabel(/I consent to emergency first aid/).check()
      await page.getByLabel('Your full name').fill('Gary Guardian')

      const submit = page.getByRole('button', { name: 'Submit registration' })
      await expect(submit).toBeEnabled({ timeout: 15000 })
      await submit.click()

      await expect(page).toHaveURL(/\/register\/success/)

      const { data } = await db
        .from('registration_submissions')
        .select(
          'id, child_last_name, registration_submission_contacts(contact_role, occupation)',
        )
        .eq('child_last_name', childLastName)
        .single()
      expect(data).not.toBeNull()
      expect(
        data?.registration_submission_contacts
          .map((c) => c.contact_role)
          .sort(),
      ).toEqual(['additional_1', 'primary', 'secondary'])

      const byRole = new Map(
        data?.registration_submission_contacts.map((c) => [
          c.contact_role,
          c.occupation,
        ]),
      )
      expect(byRole.get('primary')).toBe('Bus driver')
      expect(byRole.get('secondary')).toBe('Pharmacist')
      // Emergency contacts are not asked for an occupation.
      expect(byRole.get('additional_1')).toBeNull()
    })
  })

  test('blocks submission when a required consent is unticked', async ({
    page,
  }) => {
    await page.goto('/register')

    await page.getByLabel('First name').first().fill('Petra')
    await page.getByLabel('Last name').first().fill('NoConsent')
    await page.getByLabel('Date of birth').fill('2020-01-15')
    await page
      .locator('input[name="english_school_name"]')
      .fill('St Marys Primary')
    await page.getByLabel('Address line 1').fill('1 Test Street')
    await page.getByLabel('City').fill('London')
    await page.getByLabel('Postcode').fill('N1 1AA')
    await page.getByLabel('First name').nth(1).fill('Gary')
    await page.getByLabel('Last name').nth(1).fill('Guardian')
    await page.getByLabel('Phone').fill('07700 900000')
    await page.locator('input[name="primary_occupation"]').fill('Bus driver')
    await page.getByLabel('Your full name').fill('Gary Guardian')
    // Deliberately leave both required consents unticked.

    const submit = page.getByRole('button', { name: 'Submit registration' })
    await expect(submit).toBeEnabled({ timeout: 15000 })
    // The required checkbox attribute blocks native form submission, so the
    // server action never runs and the page never navigates.
    await submit.click()

    await expect(page).toHaveURL(/\/register$/)
    const { data } = await db
      .from('registration_submissions')
      .select('id')
      .eq('child_last_name', 'NoConsent')
    expect(data).toEqual([])
  })

  test('explains why the submit button is disabled before the security check resolves', async ({
    page,
  }) => {
    await page.goto('/register')

    const submit = page.getByRole('button', { name: 'Submit registration' })
    await expect(submit).toBeDisabled()
    await expect(
      page.getByText(
        'Please complete the security check above before submitting.',
      ),
    ).toBeVisible()

    // The Cloudflare test key auto-resolves, clearing the disabled reason.
    await expect(submit).toBeEnabled({ timeout: 15000 })
    await expect(
      page.getByText(
        'Please complete the security check above before submitting.',
      ),
    ).toBeHidden()
  })

  test('/registrations redirects unauthenticated users to /login', async ({
    page,
  }) => {
    await page.goto('/registrations')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/register shows no staff sidebar', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('aside')).toHaveCount(0)
  })
})
