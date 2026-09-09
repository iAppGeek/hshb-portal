import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import type { RegistrationSummary } from '@/db'

import RegistrationsTable from './RegistrationsTable'

const pending: RegistrationSummary = {
  id: 'sub-1',
  status: 'pending',
  submitted_at: '2026-09-01T10:00:00Z',
  child_first_name: 'Seed',
  child_last_name: 'Pending',
  date_of_birth: '2020-01-15',
  preferred_year_group: 'Year 1',
  primary_contact: {
    first_name: 'Petra',
    last_name: 'Pending',
    phone: '07700 900000',
    email: 'petra@example.com',
  },
} as RegistrationSummary

const rejected: RegistrationSummary = {
  ...pending,
  id: 'sub-2',
  status: 'rejected',
  child_first_name: 'Rhonda',
  child_last_name: 'Rejected',
  primary_contact: null,
}

describe('RegistrationsTable', () => {
  it('renders a row per registration with a status badge', () => {
    render(<RegistrationsTable registrations={[pending, rejected]} />)

    expect(screen.getByText('Pending, Seed')).toBeTruthy()
    expect(screen.getByText('Rejected, Rhonda')).toBeTruthy()
    expect(screen.getByText('pending')).toBeTruthy()
    expect(screen.getByText('rejected')).toBeTruthy()
  })

  it('links each row to its detail page', () => {
    render(<RegistrationsTable registrations={[pending]} />)
    const link = screen.getByText('Pending, Seed').closest('a')
    expect(link?.getAttribute('href')).toBe('/registrations/sub-1')
  })

  it('shows a dash for primary contact when there is none', () => {
    render(<RegistrationsTable registrations={[rejected]} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('filters rows by child name search', () => {
    render(<RegistrationsTable registrations={[pending, rejected]} />)

    fireEvent.change(screen.getByPlaceholderText('Search by child name…'), {
      target: { value: 'Rhonda' },
    })

    expect(screen.queryByText('Pending, Seed')).toBeNull()
    expect(screen.getByText('Rejected, Rhonda')).toBeTruthy()
  })
})
