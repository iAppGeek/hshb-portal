import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import type { RegistrationFull, GuardianMatch } from '@/db'

import { deleteRegistrationAction } from '../actions'

import RegistrationReview from './RegistrationReview'

vi.mock('../actions', () => ({
  deleteRegistrationAction: vi.fn(),
}))

vi.mock('./ApproveDialog', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="approve-dialog">
      <button onClick={onClose}>close-approve</button>
    </div>
  ),
}))

vi.mock('./RejectDialog', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="reject-dialog">
      <button onClick={onClose}>close-reject</button>
    </div>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const baseSubmission: RegistrationFull = {
  id: 'sub-1',
  status: 'pending' as const,
  submitted_at: '2026-09-01T10:00:00Z',
  child_first_name: 'Seed',
  child_last_name: 'Pending',
  date_of_birth: '2020-01-15',
  preferred_year_group: 'Year 1',
  address_line_1: '1 Seed St',
  address_line_2: null,
  city: 'London',
  postcode: 'N1 2AA',
  allergies: null,
  medical_details: null,
  collect_authorised: null,
  collect_password: null,
  consent_privacy_notice: true,
  consent_emergency_first_aid: true,
  consent_photo_media: false,
  consent_home_school: false,
  consent_comms_email_sms: false,
  declaration_name: 'Petra Pending',
  actioned_by: null,
  actioned_at: null,
  student_id: null,
  linked_existing: false,
  rejected_reason: null,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  contacts: [
    {
      id: 'contact-1',
      submission_id: 'sub-1',
      contact_role: 'primary' as const,
      first_name: 'Petra',
      last_name: 'Pending',
      relationship: 'Mother',
      phone: '07700 900000',
      email: 'petra@example.com',
      same_as_child_address: true,
      address_line_1: null,
      address_line_2: null,
      city: null,
      postcode: null,
      created_at: '2026-09-01T10:00:00Z',
    },
  ],
}

function renderReview(
  overrides: Partial<typeof baseSubmission> = {},
  role = 'admin',
  guardianMatchesByContact: Record<string, GuardianMatch[]> = {},
) {
  return render(
    <RegistrationReview
      submission={{ ...baseSubmission, ...overrides } as never}
      role={role as never}
      matches={[]}
      studentsForLinking={[]}
      classes={[]}
      guardianMatchesByContact={guardianMatchesByContact}
    />,
  )
}

describe('RegistrationReview', () => {
  it('renders read-only sections', () => {
    renderReview()
    expect(screen.getByText('Child')).toBeTruthy()
    expect(screen.getByText('Home address')).toBeTruthy()
    expect(screen.getByText('Medical')).toBeTruthy()
    expect(screen.getByText('Primary parent/carer')).toBeTruthy()
    expect(screen.getByText('Consents')).toBeTruthy()
    expect(screen.getByText('Workflow')).toBeTruthy()
  })

  it('shows enabled action buttons for admin on a pending submission', () => {
    renderReview()
    expect(
      screen.getByRole('button', { name: 'Approve & save student' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('shows disabled buttons with a tooltip for secretary', () => {
    renderReview({}, 'secretary')
    const approveLabel = screen.getByText('Approve & save student')
    expect(approveLabel.closest('button')).toBeNull()
    expect(screen.getAllByRole('tooltip').length).toBeGreaterThan(0)
  })

  it('hides action buttons entirely for admin once a submission is actioned', () => {
    renderReview({ status: 'actioned' }, 'admin')
    expect(screen.queryByText('Approve & save student')).toBeNull()
    expect(screen.queryByText('Reject')).toBeNull()
  })

  it('opens the approve dialog', () => {
    renderReview()
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve & save student' }),
    )
    expect(screen.getByTestId('approve-dialog')).toBeTruthy()
  })

  it('opens the reject dialog', () => {
    renderReview()
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(screen.getByTestId('reject-dialog')).toBeTruthy()
  })

  it('shows a delete confirmation and calls deleteRegistrationAction', async () => {
    vi.mocked(deleteRegistrationAction).mockResolvedValue(undefined)
    renderReview()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(
      screen.getByText(/Delete this registration permanently/),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await vi.waitFor(() => {
      expect(deleteRegistrationAction).toHaveBeenCalledWith('sub-1')
    })
  })

  it('links to the student edit page once actioned', () => {
    renderReview({ status: 'actioned', student_id: 'student-1' })
    const link = screen.getByRole('link', { name: 'View student' })
    expect(link.getAttribute('href')).toBe('/students/student-1/edit')
  })

  it('shows the rejected reason when present', () => {
    renderReview({ status: 'rejected', rejected_reason: 'Duplicate' })
    expect(screen.getByText('Duplicate')).toBeTruthy()
  })

  it('shows an amber guardian match note when a contact has a match', () => {
    renderReview({}, 'admin', {
      'contact-1': [
        {
          id: 'guardian-1',
          first_name: 'Petra',
          last_name: 'Existing',
          phone: '07700 900000',
          email: 'petra@example.com',
          matched_on: 'email',
        },
      ],
    })
    expect(screen.getByText(/Matches existing guardian/)).toBeTruthy()
  })

  it('does not show a guardian match note when there are no matches', () => {
    renderReview()
    expect(screen.queryByText(/Matches existing guardian/)).toBeNull()
  })
})
