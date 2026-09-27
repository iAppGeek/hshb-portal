import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import type { PhotoOptOutRow } from '@/db'

import {
  applyPhotoOptOutAction,
  deletePhotoOptOutAction,
  rejectPhotoOptOutAction,
} from '../../actions'

import PhotoOptOutReview from './PhotoOptOutReview'

vi.mock('../../actions', () => ({
  applyPhotoOptOutAction: vi.fn(),
  deletePhotoOptOutAction: vi.fn(),
  rejectPhotoOptOutAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const pending: PhotoOptOutRow = {
  id: 'req-1',
  status: 'pending',
  child_first_name: 'Alice',
  child_last_name: 'Student',
  date_of_birth: '2015-06-01',
  declaration_name: 'Gary AliceGuardian',
  notes: 'Please no class photos',
  submitted_at: '2026-09-01T10:00:00Z',
  actioned_by: null,
  actioned_at: null,
  student_id: null,
  rejected_reason: null,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
}

const alice = {
  id: 'student-1',
  first_name: 'Alice',
  last_name: 'Student',
  date_of_birth: '2015-06-01',
  student_code: 'S001',
  active: true,
}

function renderReview(
  overrides: Partial<PhotoOptOutRow> = {},
  role = 'admin',
): void {
  render(
    <PhotoOptOutReview
      request={{ ...pending, ...overrides }}
      role={role as never}
      matches={[alice]}
      studentsForLinking={[alice]}
    />,
  )
}

describe('PhotoOptOutReview', () => {
  it('shows the child, request and workflow details', () => {
    renderReview()
    expect(screen.getByRole('heading', { name: 'Student, Alice' })).toBeTruthy()
    expect(screen.getByText('Gary AliceGuardian')).toBeTruthy()
    expect(screen.getByText('Please no class photos')).toBeTruthy()
    expect(screen.getByText('pending')).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: '← Photo opt-outs' })
        .getAttribute('href'),
    ).toBe('/registrations?tab=photo-opt-outs')
  })

  it('shows all three actions for admin on a pending request', () => {
    renderReview()
    expect(screen.getByRole('button', { name: 'Match & apply' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('greys the actions out with a tooltip for non-admin reviewers', () => {
    renderReview({}, 'secretary')
    expect(screen.queryByRole('button', { name: 'Match & apply' })).toBeNull()
    expect(screen.getAllByRole('tooltip')[0].textContent).toBe(
      'Only admins can action opt-out requests',
    )
  })

  it('offers only Delete once actioned, and links the matched student', () => {
    renderReview({ status: 'actioned', student_id: 'student-1' })
    expect(screen.queryByText('Match & apply')).toBeNull()
    expect(screen.queryByText('Reject')).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'View student' }).getAttribute('href'),
    ).toBe('/students/student-1/edit')
  })

  it('applies the opt-out to the pre-selected match', async () => {
    vi.mocked(applyPhotoOptOutAction).mockResolvedValue(undefined)
    renderReview()

    fireEvent.click(screen.getByRole('button', { name: 'Match & apply' }))
    expect(screen.getByTestId('match-student-dialog')).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Create new student' })).toBe(
      null,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply opt-out' }))

    await waitFor(() =>
      expect(applyPhotoOptOutAction).toHaveBeenCalledWith('req-1', 'student-1'),
    )
  })

  it('rejects with a reason through the reason dialog', async () => {
    vi.mocked(rejectPhotoOptOutAction).mockResolvedValue(undefined)
    renderReview()

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(screen.getByTestId('reason-dialog')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: 'Cannot match' },
    })
    fireEvent.submit(screen.getByLabelText(/Reason/).closest('form')!)

    await waitFor(() =>
      expect(rejectPhotoOptOutAction).toHaveBeenCalledWith(
        'req-1',
        'Cannot match',
      ),
    )
  })

  it('confirms delete with the actioned-specific text', async () => {
    vi.mocked(deletePhotoOptOutAction).mockResolvedValue(undefined)
    renderReview({ status: 'actioned' })

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByTestId('confirm-dialog').textContent).toContain(
      "The student's consent flag is not affected.",
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() =>
      expect(deletePhotoOptOutAction).toHaveBeenCalledWith('req-1'),
    )
  })

  it('closes a dialog on Cancel', () => {
    renderReview()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByTestId('confirm-dialog')).toBeNull()
  })
})
