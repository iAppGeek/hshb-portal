import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import FieldError from './FieldError'

describe('FieldError', () => {
  it('renders the error message with the given id', () => {
    render(<FieldError id="email-error" error="Invalid email" />)
    const message = screen.getByText('Invalid email')
    expect(message).toHaveAttribute('id', 'email-error')
  })

  it('is announced as an alert only when asked', () => {
    const { rerender } = render(<FieldError id="e" error="Required" />)
    expect(screen.queryByRole('alert')).toBeNull()

    rerender(<FieldError id="e" error="Required" announce />)
    expect(screen.getByRole('alert')).toHaveTextContent('Required')
  })

  it('renders nothing when there is no error', () => {
    const { container } = render(<FieldError id="email-error" />)
    expect(container).toBeEmptyDOMElement()
  })
})
