import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { SHORT_TEXT_MAX } from '@/lib/schemas'

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

  it('photo consent checkbox is unchecked by default', () => {
    renderForm()

    const photoConsent = screen.getByRole('checkbox', {
      name: /I consent to my child's photo being used/,
    }) as HTMLInputElement
    expect(photoConsent).not.toBeChecked()
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

    it('tags the child name and address with WHATWG autofill tokens', () => {
      const { container } = renderForm()

      expect(autoCompleteOf(container, 'child_first_name')).toBe(
        'section-child given-name',
      )
      expect(autoCompleteOf(container, 'child_last_name')).toBe(
        'section-child family-name',
      )
      expect(autoCompleteOf(container, 'date_of_birth')).toBe('bday')
      expect(autoCompleteOf(container, 'address_line_1')).toBe(
        'section-child address-line1',
      )
      // UK split address: address-level2 is the town/city and there is no
      // county field, so address-level1 is deliberately absent.
      expect(autoCompleteOf(container, 'city')).toBe(
        'section-child address-level2',
      )
      expect(autoCompleteOf(container, 'postcode')).toBe(
        'section-child postal-code',
      )
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

    // No meaningful WHATWG token exists for these, and a wrong one is worse
    // than none: organization-title would invite employer autofill.
    it('leaves fields with no meaningful token untagged', () => {
      const { container } = renderForm()
      expect(autoCompleteOf(container, 'primary_relationship')).toBeNull()
      expect(autoCompleteOf(container, 'primary_occupation')).toBeNull()
      expect(autoCompleteOf(container, 'english_school_name')).toBeNull()
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
