import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

import FormActions from './FormActions'

describe('FormActions', () => {
  it('shows the submit label when not pending', () => {
    render(<FormActions submitLabel="Save student" isPending={false} />)
    expect(screen.getByRole('button', { name: 'Save student' })).toBeEnabled()
  })

  it('shows the pending label and disables the button while pending', () => {
    render(
      <FormActions
        submitLabel="Save student"
        pendingLabel="Saving…"
        isPending={true}
      />,
    )
    const button = screen.getByRole('button', { name: 'Saving…' })
    expect(button).toBeDisabled()
  })

  it('renders a cancel link when cancelHref is given', () => {
    render(
      <FormActions
        submitLabel="Save"
        isPending={false}
        cancelHref="/students"
      />,
    )
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/students',
    )
  })

  it('renders the form-level error with role="alert"', () => {
    render(
      <FormActions
        submitLabel="Save"
        isPending={false}
        error="Something failed"
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something failed')
  })

  it('disables submit when disabled, even when not pending', () => {
    render(<FormActions submitLabel="Save" isPending={false} disabled />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('uses cancelLabel for the cancel link text', () => {
    render(
      <FormActions
        submitLabel="Save"
        isPending={false}
        cancelHref="/students"
        cancelLabel="Back to students"
      />,
    )
    expect(
      screen.getByRole('link', { name: 'Back to students' }),
    ).toHaveAttribute('href', '/students')
  })
})
