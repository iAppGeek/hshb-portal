import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode
    href: string
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

import PermissionedLink from './PermissionedLink'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PermissionedLink', () => {
  it('renders a link when allowed', () => {
    render(
      <PermissionedLink
        href="/classes/1/edit"
        allowed={true}
        showDisabled={false}
        disabledReason="You don't have permission to edit classes"
      >
        Edit
      </PermissionedLink>,
    )
    const link = screen.getByRole('link', { name: 'Edit' })
    expect(link.getAttribute('href')).toBe('/classes/1/edit')
    expect(link.className).toBe('text-blue-600 hover:text-blue-800')
  })

  it('renders a disabled tooltip span when not allowed but showDisabled', () => {
    render(
      <PermissionedLink
        href="/classes/1/edit"
        allowed={false}
        showDisabled={true}
        disabledReason="You don't have permission to edit classes"
      >
        Edit
      </PermissionedLink>,
    )
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.getByText('Edit')).toBeTruthy()
    expect(
      screen.getByText("You don't have permission to edit classes"),
    ).toBeTruthy()
  })

  it('renders nothing when not allowed and showDisabled is false', () => {
    const { container } = render(
      <PermissionedLink
        href="/classes/1/edit"
        allowed={false}
        showDisabled={false}
        disabledReason="You don't have permission to edit classes"
      >
        Edit
      </PermissionedLink>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('derives a dimmed disabled className for a filled button', () => {
    render(
      <PermissionedLink
        href="/students/new"
        allowed={false}
        showDisabled={true}
        disabledReason="You don't have permission to add students"
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
      >
        Add student
      </PermissionedLink>,
    )
    const span = screen.getByText('Add student')
    expect(span.className).toContain('cursor-not-allowed')
    expect(span.className).toContain('opacity-50')
    expect(span.className).toContain('bg-blue-600')
    expect(span.className).not.toContain('hover:bg-blue-700')
  })

  it('accepts a custom className for the allowed link', () => {
    render(
      <PermissionedLink
        href="/x"
        allowed={true}
        showDisabled={false}
        disabledReason="nope"
        className="text-xs font-medium text-blue-600 hover:text-blue-800"
      >
        Edit
      </PermissionedLink>,
    )
    expect(screen.getByRole('link', { name: 'Edit' }).className).toBe(
      'text-xs font-medium text-blue-600 hover:text-blue-800',
    )
  })
})
