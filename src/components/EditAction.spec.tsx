import { describe, it, expect, vi, beforeEach } from 'vitest'
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

import EditAction from './EditAction'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EditAction', () => {
  it('renders an Edit link when canEdit is true', () => {
    render(
      <EditAction
        href="/classes/1/edit"
        canEdit={true}
        showDisabled={false}
        noun="classes"
      />,
    )
    const link = screen.getByRole('link', { name: 'Edit' })
    expect(link.getAttribute('href')).toBe('/classes/1/edit')
  })

  it('renders a disabled Edit span with a tooltip when canEdit is false and showDisabled is true', () => {
    render(
      <EditAction
        href="/classes/1/edit"
        canEdit={false}
        showDisabled={true}
        noun="classes"
      />,
    )
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.getByText('Edit')).toBeTruthy()
    expect(
      screen.getByText("You don't have permission to edit classes"),
    ).toBeTruthy()
  })

  it('renders nothing when canEdit is false and showDisabled is false', () => {
    const { container } = render(
      <EditAction
        href="/classes/1/edit"
        canEdit={false}
        showDisabled={false}
        noun="classes"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
