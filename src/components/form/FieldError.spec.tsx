import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import FieldError from './FieldError'

describe('FieldError', () => {
  it('renders the error message with the given id', () => {
    render(<FieldError id="email-error" error="Invalid email" />)
    const message = screen.getByText('Invalid email')
    expect(message).toHaveAttribute('id', 'email-error')
  })

  it('renders nothing when there is no error', () => {
    const { container } = render(<FieldError id="email-error" />)
    expect(container).toBeEmptyDOMElement()
  })
})
