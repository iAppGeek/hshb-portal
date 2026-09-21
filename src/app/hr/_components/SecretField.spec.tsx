import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import SecretField from './SecretField'

describe('SecretField', () => {
  it('masks the value until the eye toggle is pressed', () => {
    render(
      <SecretField
        label="Sort code"
        name="bank_sort_code"
        defaultValue="123456"
        maxLength={8}
      />,
    )

    const input = screen.getByLabelText('Sort code') as HTMLInputElement
    expect(input.type).toBe('password')
    expect(input.value).toBe('123456')
    expect(input.name).toBe('bank_sort_code')
    expect(input.maxLength).toBe(8)

    fireEvent.click(screen.getByRole('button', { name: 'Show sort code' }))
    expect(input.type).toBe('text')

    const hide = screen.getByRole('button', { name: 'Hide sort code' })
    expect(hide.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(hide)
    expect(input.type).toBe('password')
  })

  it('renders an empty input when there is no value', () => {
    render(<SecretField label="Account number" name="n" defaultValue={null} />)
    expect(
      (screen.getByLabelText('Account number') as HTMLInputElement).value,
    ).toBe('')
  })

  it('shows a field error linked to the input', () => {
    render(
      <SecretField
        label="Sort code"
        name="bank_sort_code"
        defaultValue="12"
        error="Enter a 6-digit sort code"
      />,
    )

    const input = screen.getByLabelText('Sort code')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'bank_sort_code-error')
    expect(document.getElementById('bank_sort_code-error')).toHaveTextContent(
      'Enter a 6-digit sort code',
    )
  })

  it('is not marked invalid without an error', () => {
    render(
      <SecretField label="Sort code" name="bank_sort_code" defaultValue="" />,
    )
    const input = screen.getByLabelText('Sort code')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })
})
