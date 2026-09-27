import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import type { PhotoOptOutRow } from '@/db'

import PhotoOptOutsTable from './PhotoOptOutsTable'

const pending: PhotoOptOutRow = {
  id: 'req-1',
  status: 'pending',
  child_first_name: 'Alice',
  child_last_name: 'Student',
  date_of_birth: '2015-06-01',
  declaration_name: 'Gary AliceGuardian',
  notes: null,
  submitted_at: '2026-09-01T10:00:00Z',
  actioned_by: null,
  actioned_at: null,
  student_id: null,
  rejected_reason: null,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
}

const actioned: PhotoOptOutRow = {
  ...pending,
  id: 'req-2',
  status: 'actioned',
  child_first_name: 'Bob',
  child_last_name: 'Other',
}

describe('PhotoOptOutsTable', () => {
  it('renders a row per request with the declarant and a status badge', () => {
    render(<PhotoOptOutsTable requests={[pending, actioned]} />)

    expect(screen.getByText('Student, Alice')).toBeTruthy()
    expect(screen.getByText('Other, Bob')).toBeTruthy()
    expect(screen.getAllByText('Gary AliceGuardian').length).toBeGreaterThan(0)
    expect(screen.getByText('pending')).toBeTruthy()
    expect(screen.getByText('actioned')).toBeTruthy()
  })

  it('links each row to its review page', () => {
    render(<PhotoOptOutsTable requests={[pending]} />)
    expect(
      screen.getByRole('link', { name: 'Review' }).getAttribute('href'),
    ).toBe('/registrations/photo-opt-outs/req-1')
  })

  it('filters by child name', () => {
    render(<PhotoOptOutsTable requests={[pending, actioned]} />)

    fireEvent.change(screen.getByLabelText('Search by child name'), {
      target: { value: 'alice' },
    })

    expect(screen.getByText('Student, Alice')).toBeTruthy()
    expect(screen.queryByText('Other, Bob')).toBeNull()
  })

  it('shows the empty message when there are no requests', () => {
    render(<PhotoOptOutsTable requests={[]} />)
    expect(screen.getByText('No photo opt-out requests found.')).toBeTruthy()
  })
})
