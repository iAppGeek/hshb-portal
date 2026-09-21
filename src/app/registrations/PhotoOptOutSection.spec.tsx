import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { deletePhotoOptOutAction } from './photo-opt-out-actions'
import PhotoOptOutSection from './PhotoOptOutSection'

vi.mock('./photo-opt-out-actions', () => ({
  applyPhotoOptOutAction: vi.fn(),
  deletePhotoOptOutAction: vi.fn(),
  rejectPhotoOptOutAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const pendingRequest = {
  id: 'req-1',
  status: 'pending' as const,
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

describe('PhotoOptOutSection', () => {
  it('renders nothing when there are no requests', () => {
    const { container } = render(
      <PhotoOptOutSection
        requests={[]}
        matchesByRequest={{}}
        studentsForLinking={[]}
        role="admin"
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the request and admin action buttons', () => {
    render(
      <PhotoOptOutSection
        requests={[pendingRequest]}
        matchesByRequest={{}}
        studentsForLinking={[]}
        role="admin"
      />,
    )
    expect(screen.getByText('Student, Alice')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Match & apply' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('shows a tooltip dash for non-admin reviewers', () => {
    render(
      <PhotoOptOutSection
        requests={[pendingRequest]}
        matchesByRequest={{}}
        studentsForLinking={[]}
        role="secretary"
      />,
    )
    expect(screen.queryByRole('button', { name: 'Match & apply' })).toBeNull()
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })

  it('hides Match & apply and Reject but shows Delete for admin once actioned', () => {
    render(
      <PhotoOptOutSection
        requests={[{ ...pendingRequest, status: 'actioned' }]}
        matchesByRequest={{}}
        studentsForLinking={[]}
        role="admin"
      />,
    )
    expect(screen.queryByRole('button', { name: 'Match & apply' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('shows the actioned-specific confirm text when deleting an actioned request', () => {
    render(
      <PhotoOptOutSection
        requests={[{ ...pendingRequest, status: 'actioned' }]}
        matchesByRequest={{}}
        studentsForLinking={[]}
        role="admin"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(
      screen.getByText(
        "Delete this opt-out request permanently? The student's consent flag is not affected. This cannot be undone.",
      ),
    ).toBeTruthy()
  })

  it('opens the apply dialog', () => {
    render(
      <PhotoOptOutSection
        requests={[pendingRequest]}
        matchesByRequest={{}}
        studentsForLinking={[]}
        role="admin"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Match & apply' }))
    expect(screen.getByTestId('match-student-dialog').textContent).toContain(
      'Match to a student',
    )
  })

  it('opens the reject dialog', () => {
    render(
      <PhotoOptOutSection
        requests={[pendingRequest]}
        matchesByRequest={{}}
        studentsForLinking={[]}
        role="admin"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(screen.getByTestId('reason-dialog').textContent).toContain(
      'Reject opt-out request',
    )
  })

  it('confirms and calls deletePhotoOptOutAction', async () => {
    vi.mocked(deletePhotoOptOutAction).mockResolvedValue(undefined)
    render(
      <PhotoOptOutSection
        requests={[pendingRequest]}
        matchesByRequest={{}}
        studentsForLinking={[]}
        role="admin"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByTestId('confirm-dialog').textContent).toMatch(
      /Delete this opt-out request permanently/,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => {
      expect(deletePhotoOptOutAction).toHaveBeenCalledWith('req-1')
    })
  })
})
