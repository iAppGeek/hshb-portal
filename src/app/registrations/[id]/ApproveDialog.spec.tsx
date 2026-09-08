import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { approveRegistrationAction } from '../actions'

import ApproveDialog from './ApproveDialog'

vi.mock('../actions', () => ({
  approveRegistrationAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const classes = [{ id: 'class-1', name: 'Alpha', year_group: 'Year 1' }]

const studentsForLinking = [
  {
    id: 'student-1',
    first_name: 'Alice',
    last_name: 'Smith',
    date_of_birth: '2019-01-01',
    student_code: 'S001',
    active: true,
  },
  {
    id: 'student-2',
    first_name: 'Bobby',
    last_name: 'Jones',
    date_of_birth: '2018-01-01',
    student_code: null,
    active: false,
  },
]

function submitForm() {
  fireEvent.submit(
    screen.getByRole('button', { name: 'Approve' }).closest('form')!,
  )
}

describe('ApproveDialog', () => {
  it('defaults to create mode', () => {
    render(
      <ApproveDialog
        submissionId="sub-1"
        matches={[]}
        studentsForLinking={studentsForLinking}
        classes={classes}
        hasGuardianMatches={false}
        onClose={vi.fn()}
      />,
    )
    expect(
      (
        screen.getByRole('radio', {
          name: 'Create new student',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)
  })

  it('pre-selects the first match when switching to link mode', () => {
    render(
      <ApproveDialog
        submissionId="sub-1"
        matches={[studentsForLinking[0]]}
        studentsForLinking={studentsForLinking}
        classes={classes}
        hasGuardianMatches={false}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole('radio', { name: 'Link to existing student' }),
    )
    expect(screen.getByText(/Selected: Smith, Alice/)).toBeTruthy()
  })

  it('filters the student search after 5 characters', () => {
    render(
      <ApproveDialog
        submissionId="sub-1"
        matches={[]}
        studentsForLinking={studentsForLinking}
        classes={classes}
        hasGuardianMatches={false}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole('radio', { name: 'Link to existing student' }),
    )
    const search = screen.getByLabelText('Search all students')

    fireEvent.change(search, { target: { value: 'Ali' } })
    expect(screen.queryByText(/Smith, Alice/)).toBeNull()

    fireEvent.change(search, { target: { value: 'Alice' } })
    expect(screen.getByText(/Smith, Alice/)).toBeTruthy()
  })

  it('disables Approve in link mode until a student is selected', () => {
    render(
      <ApproveDialog
        submissionId="sub-1"
        matches={[]}
        studentsForLinking={studentsForLinking}
        classes={classes}
        hasGuardianMatches={false}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole('radio', { name: 'Link to existing student' }),
    )
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('submits create mode with an empty existing_student_id', async () => {
    vi.mocked(approveRegistrationAction).mockResolvedValue(undefined)
    render(
      <ApproveDialog
        submissionId="sub-1"
        matches={[]}
        studentsForLinking={studentsForLinking}
        classes={classes}
        hasGuardianMatches={false}
        onClose={vi.fn()}
      />,
    )

    submitForm()

    await waitFor(() => {
      expect(approveRegistrationAction).toHaveBeenCalledWith(
        'sub-1',
        expect.any(FormData),
      )
    })
    const formData = vi.mocked(approveRegistrationAction).mock
      .calls[0][1] as FormData
    expect(formData.get('existing_student_id')).toBe('')
  })

  it('submits link mode with the selected existing_student_id', async () => {
    vi.mocked(approveRegistrationAction).mockResolvedValue(undefined)
    render(
      <ApproveDialog
        submissionId="sub-1"
        matches={[studentsForLinking[0]]}
        studentsForLinking={studentsForLinking}
        classes={classes}
        hasGuardianMatches={false}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole('radio', { name: 'Link to existing student' }),
    )
    submitForm()

    await waitFor(() => {
      expect(approveRegistrationAction).toHaveBeenCalled()
    })
    const formData = vi.mocked(approveRegistrationAction).mock
      .calls[0][1] as FormData
    expect(formData.get('existing_student_id')).toBe('student-1')
  })

  it('shows the error returned by the action', async () => {
    vi.mocked(approveRegistrationAction).mockResolvedValue({
      error: 'Student code "S001" is already in use',
    })
    render(
      <ApproveDialog
        submissionId="sub-1"
        matches={[]}
        studentsForLinking={studentsForLinking}
        classes={classes}
        hasGuardianMatches={false}
        onClose={vi.fn()}
      />,
    )

    submitForm()

    await waitFor(() => {
      expect(
        screen.getByText('Student code "S001" is already in use'),
      ).toBeTruthy()
    })
  })

  it('shows the reuse guardians checkbox, checked by default', () => {
    render(
      <ApproveDialog
        submissionId="sub-1"
        matches={[]}
        studentsForLinking={studentsForLinking}
        classes={classes}
        hasGuardianMatches={true}
        onClose={vi.fn()}
      />,
    )
    const checkbox = screen.getByRole('checkbox', {
      name: /Reuse matching guardian records/,
    }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(
      screen.queryByText('No existing guardians match this submission.'),
    ).toBeNull()
  })

  it('shows a hint when no guardians match', () => {
    render(
      <ApproveDialog
        submissionId="sub-1"
        matches={[]}
        studentsForLinking={studentsForLinking}
        classes={classes}
        hasGuardianMatches={false}
        onClose={vi.fn()}
      />,
    )
    expect(
      screen.getByText('No existing guardians match this submission.'),
    ).toBeTruthy()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(
      <ApproveDialog
        submissionId="sub-1"
        matches={[]}
        studentsForLinking={studentsForLinking}
        classes={classes}
        hasGuardianMatches={false}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
