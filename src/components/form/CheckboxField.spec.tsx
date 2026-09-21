import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import CheckboxField from './CheckboxField'

describe('CheckboxField', () => {
  it('renders the label and description', () => {
    render(
      <CheckboxField
        label="Consent to photos"
        name="consent_photo_media"
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
    const checkbox = screen.getByLabelText('Agree')
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
})
