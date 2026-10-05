import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

import CheckboxField from './CheckboxField'

describe('CheckboxField', () => {
  it('renders the label and description', () => {
    render(
      <CheckboxField
        label="Consent to photos"
        name="photo_video_consent"
        description="You can change this later"
      />,
    )
    expect(screen.getByLabelText('Consent to photos')).toBeInTheDocument()
    expect(screen.getByText('You can change this later')).toBeInTheDocument()
  })

  it('renders value="on" so the existing zod checkbox helper parses it', () => {
    render(<CheckboxField label="Agree" name="agree" />)
    expect(screen.getByLabelText('Agree')).toHaveAttribute('value', 'on')
  })

  it('respects defaultChecked', () => {
    render(<CheckboxField label="Agree" name="agree" defaultChecked />)
    expect(screen.getByLabelText('Agree')).toBeChecked()
  })

  it('marks aria-invalid and shows the error message', () => {
    render(
      <CheckboxField
        label="Agree"
        name="agree"
        error="You must agree"
        required
      />,
    )
    const checkbox = screen.getByRole('checkbox', { name: 'Agree' })
    expect(checkbox).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('You must agree')).toBeInTheDocument()
  })

  it('is controlled when given checked, reporting changes via onChange', () => {
    const onChange = vi.fn()
    render(
      <CheckboxField
        label="Agree"
        name="agree"
        checked={false}
        onChange={onChange}
      />,
    )
    const checkbox = screen.getByLabelText('Agree')
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('can be disabled', () => {
    render(<CheckboxField label="Agree" name="agree" disabled />)
    expect(screen.getByLabelText('Agree')).toBeDisabled()
  })

  it('accepts a label holding a link', () => {
    render(
      <CheckboxField
        label={
          <>
            I have read the <a href="/notice">notice</a>
          </>
        }
        name="agree"
      />,
    )
    expect(screen.getByLabelText('I have read the notice')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'notice' })).toHaveAttribute(
      'href',
      '/notice',
    )
  })

  it('marks a required box with an asterisk hidden from screen readers', () => {
    render(<CheckboxField label="Agree" name="agree" required />)
    const box = screen.getByRole('checkbox', { name: 'Agree' })
    expect(box).toBeRequired()
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true')
  })

  describe('requiredMessage', () => {
    const MESSAGE = 'Please tick this box'

    function renderRequired(): HTMLInputElement {
      render(
        <form>
          <CheckboxField
            label="Agree"
            name="agree"
            required
            requiredMessage={MESSAGE}
          />
        </form>,
      )
      return screen.getByRole('checkbox', { name: 'Agree' })
    }

    function submitAttempt(box: HTMLInputElement): void {
      act(() => {
        box.form!.checkValidity()
      })
    }

    it('shows nothing before the form is submitted', () => {
      renderRequired()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('announces the message in the prompt and beneath the box when submitted unticked', () => {
      const box = renderRequired()

      submitAttempt(box)

      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE)
      expect(box).toHaveAttribute('aria-invalid', 'true')
      expect(box).toHaveAccessibleDescription(MESSAGE)
      expect(box.validationMessage).toBe(MESSAGE)
    })

    it('clears the message once the box is ticked', () => {
      const box = renderRequired()
      submitAttempt(box)

      fireEvent.click(box)

      expect(screen.queryByRole('alert')).toBeNull()
      expect(box).not.toHaveAttribute('aria-invalid')
      expect(box.validationMessage).toBe('')
    })

    it('waits for the next submit before showing it again after unticking', () => {
      const box = renderRequired()
      submitAttempt(box)
      fireEvent.click(box)

      fireEvent.click(box)

      expect(box).not.toBeChecked()
      expect(screen.queryByRole('alert')).toBeNull()

      submitAttempt(box)

      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE)
    })

    it('hides a server error on a required box once it is ticked', () => {
      render(
        <CheckboxField label="Agree" name="agree" required error={MESSAGE} />,
      )
      const box = screen.getByRole('checkbox', { name: 'Agree' })
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE)

      fireEvent.click(box)

      expect(screen.queryByRole('alert')).toBeNull()
    })
  })
})
