import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import TextAreaField from './TextAreaField'

describe('TextAreaField', () => {
  it('renders the label and required mark', () => {
    render(<TextAreaField label="Notes" name="notes" required />)
    expect(screen.getByText('Notes').parentElement).toHaveTextContent('Notes*')
  })

  it('treats a null defaultValue as undefined', () => {
    render(<TextAreaField label="Notes" name="notes" defaultValue={null} />)
    expect(screen.getByLabelText('Notes')).toHaveValue('')
  })

  it('marks aria-invalid and shows the error message', () => {
    render(<TextAreaField label="Notes" name="notes" error="Too long" />)
    const textarea = screen.getByLabelText('Notes')
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(textarea).toHaveAttribute('aria-describedby', 'notes-error')
    expect(screen.getByText('Too long')).toBeInTheDocument()
  })
})
