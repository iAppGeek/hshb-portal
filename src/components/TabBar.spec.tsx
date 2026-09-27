import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode
    href: string
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import TabBar, { type Tab } from './TabBar'

beforeEach(() => {
  vi.clearAllMocks()
})

const tabs: Tab[] = [
  { key: 'pending', label: 'To-do', href: '/registrations?status=pending' },
  {
    key: 'actioned',
    label: 'Actioned',
    href: '/registrations?status=actioned',
  },
]

describe('TabBar', () => {
  it('renders a labelled nav landmark so pages can carry two tab bars', () => {
    render(<TabBar tabs={tabs} current="pending" ariaLabel="Registrations" />)
    expect(
      screen.getByRole('navigation', { name: 'Registrations' }),
    ).toBeTruthy()
  })

  it('renders a link per tab with the given href', () => {
    render(<TabBar tabs={tabs} current="pending" ariaLabel="Registrations" />)
    expect(
      screen.getByRole('link', { name: 'To-do' }).getAttribute('href'),
    ).toBe('/registrations?status=pending')
    expect(
      screen.getByRole('link', { name: 'Actioned' }).getAttribute('href'),
    ).toBe('/registrations?status=actioned')
  })

  it('applies active styles and aria-current to the current tab', () => {
    render(<TabBar tabs={tabs} current="pending" ariaLabel="Registrations" />)
    const link = screen.getByRole('link', { name: 'To-do' })
    expect(link.className).toContain('bg-white')
    expect(link.getAttribute('aria-current')).toBe('page')
  })

  it('applies inactive styles to non-current tabs', () => {
    render(<TabBar tabs={tabs} current="pending" ariaLabel="Registrations" />)
    const link = screen.getByRole('link', { name: 'Actioned' })
    expect(link.className).not.toContain('bg-white')
    expect(link.className).toContain('text-gray-500')
    expect(link.getAttribute('aria-current')).toBeNull()
  })

  it('renders an optional count badge', () => {
    render(
      <TabBar
        tabs={[{ key: 'pending', label: 'To-do', href: '/x', count: 3 }]}
        current="pending"
        ariaLabel="Registrations"
      />,
    )
    expect(screen.getByText('3')).toBeTruthy()
  })
})
