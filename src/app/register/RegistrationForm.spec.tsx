import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { submitRegistrationAction } from './actions'
import RegistrationForm from './RegistrationForm'

vi.mock('./actions', () => ({
  submitRegistrationAction: vi.fn(),
}))

vi.mock('@/clientComponents/TurnstileWidget', () => ({
  default: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <button type="button" onClick={() => onToken('test-token')}>
      Simulate Turnstile
    </button>
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

  it('reveals and removes the optional secondary parent/carer section', () => {
    renderForm()

    fireEvent.click(
      screen.getByRole('button', { name: '+ Add a second parent/carer' }),
    )
    expect(screen.getByText('Parent/carer 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByText('Parent/carer 2')).toBeNull()
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
