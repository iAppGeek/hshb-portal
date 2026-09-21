import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import FormSection from './FormSection'

describe('FormSection', () => {
  it('renders the title, description and children', () => {
    render(
      <FormSection title="Student Details" description="Basic information">
        <p>Field goes here</p>
      </FormSection>,
    )
    expect(screen.getByText('Student Details')).toBeInTheDocument()
    expect(screen.getByText('Basic information')).toBeInTheDocument()
    expect(screen.getByText('Field goes here')).toBeInTheDocument()
  })

  it('omits the remove button when onRemove is not given', () => {
    render(
      <FormSection title="Student Details">
        <p>Field</p>
      </FormSection>,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders a remove button that calls onRemove, with a custom label', () => {
    const onRemove = vi.fn()
    render(
      <FormSection
        title="Secondary Guardian"
        onRemove={onRemove}
        removeLabel="Delete"
      >
        <p>Field</p>
      </FormSection>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })
})
