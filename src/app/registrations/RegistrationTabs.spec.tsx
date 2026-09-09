import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import RegistrationTabs from './RegistrationTabs'

describe('RegistrationTabs', () => {
  it('renders all four tabs', () => {
    render(<RegistrationTabs currentStatus="pending" />)
    expect(screen.getByText('To-do')).toBeTruthy()
    expect(screen.getByText('Actioned')).toBeTruthy()
    expect(screen.getByText('Rejected')).toBeTruthy()
    expect(screen.getByText('All')).toBeTruthy()
  })

  it('links each tab to its status query param', () => {
    render(<RegistrationTabs currentStatus="pending" />)
    expect(
      screen.getByRole('link', { name: 'To-do' }).getAttribute('href'),
    ).toBe('/registrations?status=pending')
    expect(
      screen.getByRole('link', { name: 'Actioned' }).getAttribute('href'),
    ).toBe('/registrations?status=actioned')
    expect(
      screen.getByRole('link', { name: 'Rejected' }).getAttribute('href'),
    ).toBe('/registrations?status=rejected')
    expect(screen.getByRole('link', { name: 'All' }).getAttribute('href')).toBe(
      '/registrations?status=all',
    )
  })

  it('applies active styles to the current tab', () => {
    render(<RegistrationTabs currentStatus="rejected" />)
    const link = screen.getByRole('link', { name: 'Rejected' })
    expect(link.className).toContain('bg-white')
  })

  it('applies inactive styles to non-current tabs', () => {
    render(<RegistrationTabs currentStatus="pending" />)
    const link = screen.getByRole('link', { name: 'All' })
    expect(link.className).not.toContain('bg-white')
    expect(link.className).toContain('text-gray-500')
  })
})
