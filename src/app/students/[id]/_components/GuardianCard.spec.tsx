import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import GuardianCard from './GuardianCard'

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

const props = {
  firstName: 'Maria',
  lastName: 'Papadopoulos',
  phone: '07700 900000',
  id: 'guardian-1',
  relationship: 'Mother',
  collectionAllowed: true,
  role: 'admin' as const,
}

describe('GuardianCard', () => {
  it('shows the name, relationship and phone', () => {
    render(<GuardianCard {...props} />)

    expect(screen.getByText(/Maria Papadopoulos/)).toBeInTheDocument()
    expect(screen.getByText('(Mother)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '07700 900000' })).toHaveAttribute(
      'href',
      'tel:07700 900000',
    )
  })

  it('says when the guardian may collect the student', () => {
    render(<GuardianCard {...props} />)

    expect(screen.getByText('Collection allowed')).toBeInTheDocument()
    expect(screen.queryByText('Collection not allowed')).toBeNull()
  })

  it('says when the guardian may not collect the student', () => {
    render(<GuardianCard {...props} collectionAllowed={false} />)

    expect(screen.getByText('Collection not allowed')).toBeInTheDocument()
  })

  it('links to editing the guardian only for a role that may', () => {
    const { rerender } = render(<GuardianCard {...props} />)
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/guardians/guardian-1/edit',
    )

    rerender(<GuardianCard {...props} role="teacher" />)
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
  })
})
