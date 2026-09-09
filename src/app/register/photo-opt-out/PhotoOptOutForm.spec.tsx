import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { SHORT_TEXT_MAX } from '@/lib/schemas'

import { submitPhotoOptOutAction } from './actions'
import PhotoOptOutForm from './PhotoOptOutForm'

vi.mock('./actions', () => ({
  submitPhotoOptOutAction: vi.fn(),
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
  vi.mocked(submitPhotoOptOutAction).mockResolvedValue(undefined)
})

function renderForm() {
  return render(<PhotoOptOutForm turnstileSiteKey="test-site-key" />)
}

describe('PhotoOptOutForm', () => {
  it('limits child_first_name to SHORT_TEXT_MAX characters', () => {
    const { container } = renderForm()

    const input = container.querySelector(
      'input[name="child_first_name"]',
    ) as HTMLInputElement
    expect(input.maxLength).toBe(SHORT_TEXT_MAX)
  })

  it('renders both sections', () => {
    renderForm()

    expect(screen.getByText("Child's details")).toBeTruthy()
    expect(screen.getByText('Declaration')).toBeTruthy()
  })

  it('disables submit until a Turnstile token is issued', () => {
    renderForm()

    const submit = screen.getByRole('button', {
      name: 'Withdraw photo consent',
    })
    expect(submit).toBeDisabled()

    fireEvent.click(screen.getByText('Simulate Turnstile'))
    expect(submit).not.toBeDisabled()
  })

  it('displays the error returned by the server action', async () => {
    vi.mocked(submitPhotoOptOutAction).mockResolvedValue({
      error: 'Verification failed. Please try again.',
    })
    const { container } = renderForm()

    fireEvent.click(screen.getByText('Simulate Turnstile'))
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => {
      expect(
        screen.getByText('Verification failed. Please try again.'),
      ).toBeTruthy()
    })
  })

  it('submits the form data via submitPhotoOptOutAction', async () => {
    const { container } = renderForm()

    fireEvent.change(screen.getByLabelText(/First name/), {
      target: { value: 'Alice' },
    })
    fireEvent.change(screen.getByLabelText(/Last name/), {
      target: { value: 'Student' },
    })
    fireEvent.change(screen.getByLabelText(/Date of birth/), {
      target: { value: '2015-06-01' },
    })
    fireEvent.change(screen.getByLabelText(/Your full name/), {
      target: { value: 'Gary AliceGuardian' },
    })
    fireEvent.click(screen.getByText('Simulate Turnstile'))
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => {
      expect(submitPhotoOptOutAction).toHaveBeenCalledWith(expect.any(FormData))
    })
    const formData = vi.mocked(submitPhotoOptOutAction).mock
      .calls[0][0] as FormData
    expect(formData.get('child_first_name')).toBe('Alice')
    expect(formData.get('turnstile_token')).toBe('test-token')
  })
})
