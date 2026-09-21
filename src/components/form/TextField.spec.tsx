import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import TextField from './TextField'

describe('TextField', () => {
  it('renders the label and required mark', () => {
    render(<TextField label="First name" name="first_name" required />)
    const label = screen.getByText('First name')
    expect(label.parentElement).toHaveTextContent('First name*')
  })

  it('does not render a required mark when not required', () => {
    render(<TextField label="Middle name" name="middle_name" />)
    expect(screen.queryByText('*')).not.toBeInTheDocument()
  })

  it('treats a null defaultValue as undefined', () => {
    render(<TextField label="Notes" name="notes" defaultValue={null} />)
    expect(screen.getByLabelText('Notes')).toHaveValue('')
  })

  it('wires aria-describedby to the hint when there is no error', () => {
    render(<TextField label="Postcode" name="postcode" hint="e.g. SW1A 1AA" />)
    const input = screen.getByLabelText('Postcode')
    expect(input).toHaveAttribute('aria-describedby', 'postcode-hint')
    expect(screen.getByText('e.g. SW1A 1AA')).toBeInTheDocument()
  })

  it('wires aria-describedby and aria-invalid to the error, hiding the hint', () => {
    render(
      <TextField
        label="Email"
        name="email"
        hint="We will not share this"
        error="Invalid email"
      />,
    )
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'email-error')
    expect(screen.getByText('Invalid email')).toBeInTheDocument()
    expect(screen.queryByText('We will not share this')).not.toBeInTheDocument()
  })

  it('defaults inputMode and autoComplete from the type', () => {
    render(<TextField label="Phone" name="phone" type="tel" />)
    const input = screen.getByLabelText('Phone')
    expect(input).toHaveAttribute('inputMode', 'tel')
    expect(input).toHaveAttribute('autoComplete', 'tel')
  })

  it('lets an explicit autoComplete/inputMode override the type default', () => {
    render(
      <TextField
        label="Postcode"
        name="postcode"
        autoComplete="postal-code"
        inputMode="text"
      />,
    )
    const input = screen.getByLabelText('Postcode')
    expect(input).toHaveAttribute('autoComplete', 'postal-code')
    expect(input).toHaveAttribute('inputMode', 'text')
  })

  it('is controlled when given a value, reporting changes via onChange', () => {
    const onChange = vi.fn()
    render(
      <TextField
        label="Issue date"
        name="issue_date"
        value="2026-01-01"
        onChange={onChange}
      />,
    )
    const input = screen.getByLabelText('Issue date')
    expect(input).toHaveValue('2026-01-01')
    fireEvent.change(input, { target: { value: '2026-02-02' } })
    expect(onChange).toHaveBeenCalledWith('2026-02-02')
  })

  it('renders readOnly with read-only styling, keeping the value submittable', () => {
    render(
      <TextField label="Code" name="code" defaultValue="2026-27" readOnly />,
    )
    const input = screen.getByLabelText('Code')
    expect(input).toHaveAttribute('readonly')
    expect(input).not.toBeDisabled()
    expect(input).toHaveClass('bg-gray-50')
  })
})
