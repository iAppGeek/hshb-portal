import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

import GuardianSelector from './GuardianSelector'

const guardians = [
  {
    id: 'guardian-1',
    first_name: 'Maria',
    last_name: 'Smith',
    phone: '07700 900000',
    email: 'maria@example.com',
  },
  {
    id: 'guardian-2',
    first_name: 'George',
    last_name: 'Jones',
    phone: '07700 900001',
    email: 'george@example.com',
  },
]

const noErrors = (): undefined => undefined

function renderSelector(
  props: Partial<React.ComponentProps<typeof GuardianSelector>> = {},
): HTMLFormElement {
  const { container } = render(
    <form>
      <GuardianSelector
        prefix="primary"
        guardians={guardians}
        fieldError={noErrors}
        {...props}
      />
    </form>,
  )
  const form = container.querySelector('form')
  if (!form) throw new Error('form not found')
  return form
}

describe('GuardianSelector', () => {
  it('starts in "Add new" mode with prefixed guardian fields', () => {
    const form = renderSelector({ showAddress: true, requireEmail: true })

    expect(screen.getByRole('radio', { name: 'Add new' })).toBeChecked()
    expect(new FormData(form).get('primary_mode')).toBe('new')
    expect(screen.getByLabelText(/^First name/)).toHaveAttribute(
      'name',
      'primary_first_name',
    )
    expect(screen.getByLabelText(/^Email/)).toBeRequired()
    expect(screen.getByLabelText(/^Postcode/)).toHaveAttribute(
      'name',
      'primary_postcode',
    )
  })

  it('omits the address fields unless showAddress is set', () => {
    renderSelector()
    expect(screen.queryByLabelText(/^Postcode/)).toBeNull()
  })

  it('hides the mode toggle when there are no guardians to pick from', () => {
    renderSelector({ guardians: [] })
    expect(screen.queryByRole('radio', { name: 'Select existing' })).toBeNull()
  })

  it('pre-selects an existing guardian with an edit link', () => {
    const form = renderSelector({
      defaultId: 'guardian-2',
      defaultRelationship: 'Father',
    })

    expect(screen.getByRole('radio', { name: 'Select existing' })).toBeChecked()
    const fd = new FormData(form)
    expect(fd.get('primary_mode')).toBe('existing')
    expect(fd.get('primary_existing_id')).toBe('guardian-2')
    expect(fd.get('primary_relationship')).toBe('Father')
    expect(screen.getByRole('link', { name: 'Edit guardian' })).toHaveAttribute(
      'href',
      '/guardians/guardian-2/edit',
    )
  })

  it('lists guardians only once the search reaches five characters', () => {
    renderSelector()
    fireEvent.click(screen.getByRole('radio', { name: 'Select existing' }))

    const search = screen.getByLabelText('Search guardians')
    fireEvent.change(search, { target: { value: 'Mar' } })
    expect(screen.getByRole('option', { name: 'Keep typing…' })).toBeDisabled()
    expect(screen.queryByRole('option', { name: /Smith, Maria/ })).toBeNull()

    fireEvent.change(search, { target: { value: 'Maria' } })
    const option = screen.getByRole('option', { name: /Smith, Maria/ })
    fireEvent.change(screen.getByLabelText(/^Guardian/), {
      target: { value: 'guardian-1' },
    })
    expect(option).toHaveProperty('selected', true)
    expect(screen.getByRole('link', { name: 'Edit guardian' })).toBeVisible()
  })

  it('keeps the current guardian listed when it is not in the search results', () => {
    renderSelector({ defaultId: 'guardian-2' })
    fireEvent.change(screen.getByLabelText('Search guardians'), {
      target: { value: 'Maria' },
    })

    expect(
      screen.getByRole('option', { name: /Jones, George/ }),
    ).toHaveProperty('selected', true)
    expect(screen.getByRole('option', { name: /Smith, Maria/ })).toBeVisible()
  })

  it('shows prefixed field errors in both modes', () => {
    const fieldError = (name: string): string | undefined =>
      ({
        primary_existing_id: 'Select a guardian',
        primary_phone: 'Enter a valid phone number',
      })[name]

    const { unmount } = render(
      <GuardianSelector
        prefix="primary"
        guardians={guardians}
        defaultId="guardian-1"
        fieldError={fieldError}
      />,
    )
    expect(screen.getByLabelText(/^Guardian/)).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByText('Select a guardian')).toBeInTheDocument()
    unmount()

    render(
      <GuardianSelector
        prefix="primary"
        guardians={guardians}
        fieldError={fieldError}
      />,
    )
    expect(screen.getByLabelText(/^Phone/)).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByText('Enter a valid phone number')).toBeInTheDocument()
  })
})
