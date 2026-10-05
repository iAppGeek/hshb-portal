import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'

import { SHORT_TEXT_MAX } from '@/lib/schemas'
import {
  HOME_SCHOOL_AGREEMENT_URL,
  POLICIES_URL,
  PRIVACY_NOTICE_URL,
} from '@/lib/schoolWebsite'

import { submitRegistrationAction } from './actions'
import RegistrationForm from './RegistrationForm'

vi.mock('./actions', () => ({
  submitRegistrationAction: vi.fn(),
}))

vi.mock('@/clientComponents/TurnstileWidget', () => ({
  default: ({
    onToken,
    onError,
  }: {
    onToken: (token: string | null) => void
    onError?: () => void
  }) => (
    <>
      <button type="button" onClick={() => onToken('test-token')}>
        Simulate Turnstile
      </button>
      <button type="button" onClick={() => onError?.()}>
        Simulate Turnstile Error
      </button>
    </>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(submitRegistrationAction).mockResolvedValue(undefined)
})

function renderForm() {
  return render(
    <RegistrationForm
      yearGroups={['Year 1', 'Year 2']}
      turnstileSiteKey="test-site-key"
    />,
  )
}

/** The card a `FormSection` renders around the heading `title`. */
function sectionOf(title: string): HTMLElement {
  return screen
    .getByRole('heading', { name: title })
    .closest<HTMLElement>('.rounded-xl')!
}

describe('RegistrationForm', () => {
  it('renders all sections', () => {
    renderForm()

    expect(screen.getByText("Child's details")).toBeTruthy()
    expect(screen.getByText('Home address')).toBeTruthy()
    expect(screen.getByText('Medical & dietary')).toBeTruthy()
    expect(screen.getByText('Parent/carer 1 (required)')).toBeTruthy()
    expect(screen.getByText('Consents')).toBeTruthy()
    expect(screen.getByText('Declaration')).toBeTruthy()
  })

  describe('consents', () => {
    const REQUIRED_MESSAGE =
      'Please tick this box to continue — it is required to register.'

    function consentBoxes(): HTMLInputElement[] {
      const section = sectionOf('Consents')
      return within(section).getAllByRole('checkbox')
    }

    it('lists the five consents in order with the approved wording', () => {
      renderForm()

      expect(
        consentBoxes().map((box) => [box.name, box.labels![0].textContent]),
      ).toEqual([
        [
          'privacy_notice_read',
          "I confirm I have read the School's Privacy Notice (opens in a new tab).*",
        ],
        [
          'first_aid_consent',
          'I consent to emergency first aid being given to my child if needed.*',
        ],
        [
          'email_sms_contact_ack',
          'I understand the School will contact me by email and SMS about lessons, closures, collection arrangements and emergencies.*',
        ],
        [
          'photo_video_consent',
          "I consent to photos and video of my child being used on ClassDojo, the School website, the School's social media, printed material and in local or community press, as described in the Privacy Notice (opens in a new tab) (Section 5). I can withdraw this at any time by contacting the School office.",
        ],
        [
          'home_school_agreement',
          'I agree to the home–school agreement (opens in a new tab).',
        ],
      ])
    })

    it('starts with every consent unticked', () => {
      renderForm()

      for (const box of consentBoxes()) expect(box).not.toBeChecked()
    })

    it('requires the first three consents and leaves the last two optional', () => {
      renderForm()

      expect(consentBoxes().map((box) => box.required)).toEqual([
        true,
        true,
        true,
        false,
        false,
      ])
    })

    it('explains the required marker beneath the list', () => {
      renderForm()

      const section = sectionOf('Consents')
      expect(section.textContent).toContain('* Required to register')
    })

    it('links the Privacy Notice and home–school agreement in a new tab', () => {
      renderForm()

      const privacyLinks = screen.getAllByRole('link', {
        name: 'Privacy Notice (opens in a new tab)',
      })
      // The privacy consent, the photo consent and the medical statement.
      expect(privacyLinks).toHaveLength(3)
      for (const link of privacyLinks) {
        expect(link).toHaveAttribute('href', PRIVACY_NOTICE_URL)
        expect(link).toHaveAttribute('target', '_blank')
      }

      expect(
        screen.getByRole('link', {
          name: 'home–school agreement (opens in a new tab)',
        }),
      ).toHaveAttribute('href', HOME_SCHOOL_AGREEMENT_URL)
    })

    it('blocks submission and announces the message on each unticked required box', () => {
      const { container } = renderForm()
      const form = container.querySelector('form')!
      const [privacy, firstAid, contact] = consentBoxes()
      fireEvent.click(firstAid)

      let valid = true
      act(() => {
        valid = form.checkValidity()
      })
      expect(valid).toBe(false)

      const alerts = screen.getAllByRole('alert')
      expect(alerts.map((a) => a.textContent)).toEqual([
        REQUIRED_MESSAGE,
        REQUIRED_MESSAGE,
      ])
      expect(privacy).toHaveAttribute('aria-invalid', 'true')
      expect(privacy).toHaveAccessibleDescription(REQUIRED_MESSAGE)
      expect(privacy.validationMessage).toBe(REQUIRED_MESSAGE)
      expect(contact).toHaveAccessibleDescription(REQUIRED_MESSAGE)
      expect(firstAid).not.toHaveAttribute('aria-invalid')
    })

    it('clears the message once the box is ticked', () => {
      const { container } = renderForm()
      act(() => {
        container.querySelector('form')!.checkValidity()
      })
      const [privacy] = consentBoxes()

      fireEvent.click(privacy)

      expect(privacy).not.toHaveAttribute('aria-invalid')
      expect(privacy.validationMessage).toBe('')
      expect(screen.getAllByRole('alert')).toHaveLength(2)
    })

    it('shows a required-box error returned by the server', async () => {
      vi.mocked(submitRegistrationAction).mockResolvedValue({
        error: REQUIRED_MESSAGE,
        fieldErrors: { email_sms_contact_ack: REQUIRED_MESSAGE },
      })
      const { container } = renderForm()

      fireEvent.click(screen.getByText('Simulate Turnstile'))
      fireEvent.submit(container.querySelector('form')!)

      const contact = consentBoxes()[2]
      await waitFor(() => {
        expect(contact).toHaveAccessibleDescription(REQUIRED_MESSAGE)
      })
    })
  })

  describe('medical, dietary and additional needs', () => {
    it('asks about special educational needs or disability', () => {
      renderForm()

      expect(
        screen.getByLabelText(
          'Any special educational needs or disability we should know about, so we can make reasonable adjustments',
        ),
      ).toHaveAttribute('name', 'sen_details')
    })

    it('states how the information is used, without a checkbox', () => {
      renderForm()

      const section = sectionOf('Medical & dietary')
      expect(section.textContent).toContain(
        'By giving this information, you consent to the School holding it and sharing it with the staff and volunteers who need it to keep your child safe. See the Privacy Notice (opens in a new tab), Section 4.',
      )
      expect(within(section).queryByRole('checkbox')).toBeNull()
    })
  })

  describe('may leave unaccompanied', () => {
    const LABEL =
      'My child may leave the School on their own at the end of the session.'
    const HINT = 'Only for children aged 12 or over.'

    // 4 Oct 2026: a child born on 4 Oct 2014 turns 12 that day.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-04T09:30:00Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    function enterDateOfBirth(value: string): void {
      fireEvent.change(screen.getByLabelText(/Date of birth/), {
        target: { value },
      })
    }

    function box(): HTMLInputElement {
      return screen.getByRole('checkbox', { name: LABEL })
    }

    it('is always in the Collection section, disabled with the age hint until a date of birth is entered', () => {
      renderForm()

      expect(sectionOf('Collection arrangements')).toContainElement(box())
      expect(box()).toBeDisabled()
      expect(box()).toHaveAccessibleDescription(HINT)
    })

    it('stays disabled for a child under 12', () => {
      renderForm()

      enterDateOfBirth('2014-10-05')

      expect(box()).toBeDisabled()
      expect(box()).toHaveAccessibleDescription(HINT)
    })

    it('is enabled, unticked and optional for a child aged 12 or over', () => {
      renderForm()

      enterDateOfBirth('2014-10-04')

      expect(box()).toBeEnabled()
      expect(box()).not.toBeChecked()
      expect(box()).not.toBeRequired()
      expect(box()).toHaveAttribute('name', 'may_leave_unaccompanied')
      expect(screen.queryByText(HINT)).toBeNull()
    })

    it('is unticked, and so not submitted, when the date of birth changes to a younger child', () => {
      const { container } = renderForm()
      enterDateOfBirth('2010-01-01')
      fireEvent.click(box())
      expect(box()).toBeChecked()

      enterDateOfBirth('2020-01-01')

      expect(box()).toBeDisabled()
      expect(box()).not.toBeChecked()
      const data = new FormData(container.querySelector('form')!)
      expect(data.has('may_leave_unaccompanied')).toBe(false)
    })

    it('stays unticked when the date of birth changes back to an older child', () => {
      renderForm()
      enterDateOfBirth('2010-01-01')
      fireEvent.click(box())
      enterDateOfBirth('2020-01-01')

      enterDateOfBirth('2010-01-01')

      expect(box()).toBeEnabled()
      expect(box()).not.toBeChecked()
    })

    it('sits alongside the collection fields once an emergency contact is added', () => {
      renderForm()
      fireEvent.click(
        screen.getByRole('button', { name: '+ Add an emergency contact' }),
      )

      const section = sectionOf('Collection arrangements')
      expect(section).toContainElement(box())
      expect(within(section).getByLabelText('Collection password')).toBeTruthy()
    })
  })

  it('states that submitting means agreeing to the School Policies', () => {
    renderForm()

    const link = screen.getByRole('link', {
      name: 'School Policies (opens in a new tab)',
    })
    expect(link).toHaveAttribute('href', POLICIES_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.closest('p')!.textContent).toBe(
      'By submitting this form, you agree to follow the School Policies (opens in a new tab), including our arrangements for drop-off, collection, behaviour and safeguarding.',
    )
  })

  it('limits child_first_name to SHORT_TEXT_MAX characters', () => {
    const { container } = renderForm()

    const input = container.querySelector(
      'input[name="child_first_name"]',
    ) as HTMLInputElement
    expect(input.maxLength).toBe(SHORT_TEXT_MAX)
  })

  describe('browser autofill', () => {
    const autoCompleteOf = (container: HTMLElement, name: string) =>
      container
        .querySelector(`input[name="${name}"]`)
        ?.getAttribute('autocomplete')

    // The child is not the person filling the form, so there is nothing in the
    // browser's profile that legitimately belongs in these fields. Sectioning
    // them was not enough — the browser still offered the adult's saved
    // identity inside the section.
    it('disables autofill on every child detail field', () => {
      const { container } = renderForm()

      expect(autoCompleteOf(container, 'child_first_name')).toBe('off')
      expect(autoCompleteOf(container, 'child_last_name')).toBe('off')
      expect(autoCompleteOf(container, 'date_of_birth')).toBe('off')
      // Reported from production: Chrome matched on the field name ending in
      // "name" and filled this with the parent's full name.
      expect(autoCompleteOf(container, 'english_school_name')).toBe('off')
      expect(
        container
          .querySelector('select[name="preferred_year_group"]')
          ?.getAttribute('autocomplete'),
      ).toBe('off')
    })

    // The household address, filled in by the parent, so their saved profile
    // is the right source — no section, or it would match nothing they have.
    it('tags the home address with unscoped address tokens', () => {
      const { container } = renderForm()

      expect(autoCompleteOf(container, 'address_line_1')).toBe('address-line1')
      expect(autoCompleteOf(container, 'address_line_2')).toBe('address-line2')
      // UK split address: address-level2 is the town/city and there is no
      // county field, so address-level1 is deliberately absent.
      expect(autoCompleteOf(container, 'city')).toBe('address-level2')
      expect(autoCompleteOf(container, 'postcode')).toBe('postal-code')
    })

    it('tags each contact with name, phone and email tokens', () => {
      const { container } = renderForm()

      expect(autoCompleteOf(container, 'primary_first_name')).toBe(
        'section-primary given-name',
      )
      expect(autoCompleteOf(container, 'primary_last_name')).toBe(
        'section-primary family-name',
      )
      expect(autoCompleteOf(container, 'primary_phone')).toBe(
        'section-primary tel',
      )
      expect(autoCompleteOf(container, 'primary_email')).toBe(
        'section-primary email',
      )
    })

    // The guard against the browser filling one person into every block.
    it('gives each contact block a distinct autofill section', () => {
      const { container } = renderForm()

      fireEvent.click(
        screen.getByRole('button', { name: '+ Add a second parent/carer' }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: '+ Add an emergency contact' }),
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: '+ Add a second emergency contact',
        }),
      )

      const sections = ['primary', 'secondary', 'contact1', 'contact2'].map(
        (prefix) => autoCompleteOf(container, `${prefix}_first_name`),
      )

      expect(sections).toEqual([
        'section-primary given-name',
        'section-secondary given-name',
        'section-contact1 given-name',
        'section-contact2 given-name',
      ])
      expect(new Set(sections).size).toBe(4)
    })

    it('keeps the declaration out of the contact sections', () => {
      const { container } = renderForm()
      expect(autoCompleteOf(container, 'declaration_name')).toBe(
        'section-declaration name',
      )
    })

    // No meaningful WHATWG token exists for these. Untagged is not neutral:
    // the browser falls back to guessing from the field name, so they are
    // turned off explicitly rather than left bare.
    it('disables autofill where no meaningful token exists', () => {
      const { container } = renderForm()
      expect(autoCompleteOf(container, 'primary_relationship')).toBe('off')
      expect(autoCompleteOf(container, 'primary_occupation')).toBe('off')
    })
  })

  it('requires the English school name', () => {
    const { container } = renderForm()
    const input = container.querySelector(
      'input[name="english_school_name"]',
    ) as HTMLInputElement
    expect(input.required).toBe(true)
    expect(input.maxLength).toBe(SHORT_TEXT_MAX)
  })

  // Occupation is asked of every contact but only required of parents/carers.
  it('requires an occupation for parents/carers but not emergency contacts', () => {
    const { container } = renderForm()

    fireEvent.click(
      screen.getByRole('button', { name: '+ Add a second parent/carer' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: '+ Add an emergency contact' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: '+ Add a second emergency contact' }),
    )

    const occupation = (prefix: string) =>
      container.querySelector(
        `input[name="${prefix}_occupation"]`,
      ) as HTMLInputElement

    expect(occupation('primary').required).toBe(true)
    expect(occupation('secondary').required).toBe(true)
    expect(occupation('contact1').required).toBe(false)
    expect(occupation('contact2').required).toBe(false)
    expect(occupation('primary').maxLength).toBe(SHORT_TEXT_MAX)
  })

  it('reveals and removes the optional secondary parent/carer section', () => {
    renderForm()

    fireEvent.click(
      screen.getByRole('button', { name: '+ Add a second parent/carer' }),
    )
    expect(screen.getByText('Parent/carer 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByText('Parent/carer 2')).toBeNull()
  })

  it('flags the secondary parent and emergency contacts as present so the server includes them', () => {
    const { container } = renderForm()

    const hasSecondary = () =>
      (
        container.querySelector(
          'input[name="has_secondary"]',
        ) as HTMLInputElement
      ).value
    const hasContact1 = () =>
      (
        container.querySelector(
          'input[name="has_contact1"]',
        ) as HTMLInputElement
      ).value
    const hasContact2 = () =>
      (
        container.querySelector(
          'input[name="has_contact2"]',
        ) as HTMLInputElement
      ).value

    expect(hasSecondary()).toBe('false')
    expect(hasContact1()).toBe('false')
    expect(hasContact2()).toBe('false')

    fireEvent.click(
      screen.getByRole('button', { name: '+ Add a second parent/carer' }),
    )
    expect(hasSecondary()).toBe('true')

    fireEvent.click(
      screen.getByRole('button', { name: '+ Add an emergency contact' }),
    )
    expect(hasContact1()).toBe('true')

    fireEvent.click(
      screen.getByRole('button', { name: '+ Add a second emergency contact' }),
    )
    expect(hasContact2()).toBe('true')
  })

  it('reveals emergency contact 2 only after contact 1 is added', () => {
    renderForm()

    expect(
      screen.queryByRole('button', {
        name: '+ Add a second emergency contact',
      }),
    ).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: '+ Add an emergency contact' }),
    )
    expect(screen.getByText('Emergency contact 1')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: '+ Add a second emergency contact' }),
    ).toBeTruthy()
  })

  it('toggles the same-address fields for the primary contact', () => {
    renderForm()

    // Checked by default: address fields are hidden
    expect(screen.queryByLabelText('Address line 1')).toBeNull()

    fireEvent.click(screen.getByLabelText('Same address as the child'))
    expect(screen.getAllByLabelText('Address line 1').length).toBeGreaterThan(0)
  })

  it('disables submit until a Turnstile token is issued', () => {
    renderForm()

    const submit = screen.getByRole('button', {
      name: 'Submit registration',
    })
    expect(submit).toBeDisabled()

    fireEvent.click(screen.getByText('Simulate Turnstile'))
    expect(submit).not.toBeDisabled()
  })

  it('explains why the submit button is disabled before the security check completes', () => {
    renderForm()

    const submit = screen.getByRole('button', {
      name: 'Submit registration',
    })
    expect(submit).toBeDisabled()
    expect(submit.closest('span')).toHaveAttribute(
      'title',
      'Please complete the security check above before submitting.',
    )
    expect(
      screen.getByText(
        'Please complete the security check above before submitting.',
      ),
    ).toBeTruthy()
  })

  it('explains that the security check failed to load when Turnstile errors', () => {
    renderForm()

    fireEvent.click(screen.getByText('Simulate Turnstile Error'))

    const submit = screen.getByRole('button', {
      name: 'Submit registration',
    })
    expect(submit).toBeDisabled()
    expect(
      screen.getByText(
        'The security check failed to load. Please refresh the page and try again.',
      ),
    ).toBeTruthy()
  })

  it('clears the disabled reason once a token is issued', () => {
    renderForm()

    fireEvent.click(screen.getByText('Simulate Turnstile'))

    const submit = screen.getByRole('button', {
      name: 'Submit registration',
    })
    expect(submit).not.toBeDisabled()
    expect(submit.closest('span')).not.toHaveAttribute('title')
  })

  it('scrolls the newly revealed second parent/carer section into view', () => {
    renderForm()
    const scrollIntoViewMock = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoViewMock

    fireEvent.click(
      screen.getByRole('button', { name: '+ Add a second parent/carer' }),
    )

    expect(scrollIntoViewMock).toHaveBeenCalled()
  })

  it('scrolls the newly revealed emergency contact section into view', () => {
    renderForm()
    const scrollIntoViewMock = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoViewMock

    fireEvent.click(
      screen.getByRole('button', { name: '+ Add an emergency contact' }),
    )

    expect(scrollIntoViewMock).toHaveBeenCalled()
  })

  it('displays the error returned by the server action', async () => {
    vi.mocked(submitRegistrationAction).mockResolvedValue({
      error: 'Verification failed. Please try again.',
    })
    const { container } = renderForm()

    fireEvent.click(screen.getByText('Simulate Turnstile'))
    // Bypass HTML5 required-field validation (server action re-validates anyway).
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => {
      expect(
        screen.getByText('Verification failed. Please try again.'),
      ).toBeTruthy()
    })
  })
})
