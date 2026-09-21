import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import PageHeader from './PageHeader'

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="Staff" />)
    expect(screen.getByRole('heading', { name: 'Staff' })).toBeTruthy()
  })

  it('renders an action when provided', () => {
    render(<PageHeader title="Classes" action={<button>Add Class</button>} />)
    expect(screen.getByRole('button', { name: 'Add Class' })).toBeTruthy()
  })

  it('renders no action when omitted', () => {
    render(<PageHeader title="Students" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders a subtitle when provided', () => {
    render(<PageHeader title="Staff" subtitle="Admin" />)
    expect(screen.getByText('Admin')).toBeTruthy()
  })

  it('renders no subtitle when omitted', () => {
    render(<PageHeader title="Staff" />)
    expect(screen.queryByText('Admin')).toBeNull()
  })

  it('renders a back link when backHref is provided', () => {
    render(
      <PageHeader
        title="Add Student"
        backHref="/students"
        backLabel="Students"
      />,
    )
    const link = screen.getByRole('link', { name: '← Students' })
    expect(link.getAttribute('href')).toBe('/students')
  })

  it('renders no back link when backHref is omitted', () => {
    render(<PageHeader title="Add Student" />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
