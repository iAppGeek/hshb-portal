import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  saveAttendanceAction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

import AttendanceForm from './AttendanceForm'
import { saveAttendanceAction } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
})

const header = {
  className: 'Year 3A',
  date: '2024-03-08',
  dateLabel: 'Historical' as const,
}

function savedRow(studentId: string, status: string): Record<string, unknown> {
  return {
    id: `att-${studentId}`,
    class_id: 'class-1',
    student_id: studentId,
    date: '2024-03-08',
    status,
    notes: null,
    recorded_by: 'staff-1',
    created_at: '2024-03-08T09:00:00Z',
    updated_at: '2024-03-08T09:00:00Z',
  }
}

const students = [
  {
    id: 'student-1',
    first_name: 'Anna',
    last_name: 'Papadopoulos',
    student_code: 'S001',
    student_classes: [],
    address_guardian_id: null,
    address_guardian: null,
    address_line_1: null,
    address_line_2: null,
    city: null,
    postcode: null,
    allergies: null,
    notes: null,
    medical_details: null,
    primary_guardian_id: 'guardian-1',
    primary_guardian: {
      first_name: 'Maria',
      last_name: 'Papadopoulos',
      phone: '07700 900000',
      email: 'maria@example.com',
      occupation: 'Teacher',
      address_line_1: null,
      address_line_2: null,
      city: null,
      postcode: null,
      notes: null,
    },
    primary_guardian_relationship: 'Mother',
    secondary_guardian_id: null,
    secondary_guardian: null,
    secondary_guardian_relationship: null,
    additional_contact_1_id: null,
    additional_contact_1: null,
    additional_contact_1_relationship: null,
    additional_contact_2_id: null,
    additional_contact_2: null,
    additional_contact_2_relationship: null,
    privacy_notice_read: false,
    first_aid_consent: false,
    photo_video_consent: false,
    home_school_agreement: false,
    email_sms_contact_ack: false,
  },
  {
    id: 'student-2',
    first_name: 'Nick',
    last_name: 'Georgiou',
    student_code: 'S002',
    student_classes: [],
    address_guardian_id: null,
    address_guardian: null,
    address_line_1: null,
    address_line_2: null,
    city: null,
    postcode: null,
    allergies: null,
    notes: null,
    medical_details: null,
    primary_guardian_id: 'guardian-2',
    primary_guardian: {
      first_name: 'Eleni',
      last_name: 'Georgiou',
      phone: '07700 900001',
      email: null,
      occupation: 'Teacher',
      address_line_1: null,
      address_line_2: null,
      city: null,
      postcode: null,
      notes: null,
    },
    primary_guardian_relationship: null,
    secondary_guardian_id: null,
    secondary_guardian: null,
    secondary_guardian_relationship: null,
    additional_contact_1_id: null,
    additional_contact_1: null,
    additional_contact_1_relationship: null,
    additional_contact_2_id: null,
    additional_contact_2: null,
    additional_contact_2_relationship: null,
    privacy_notice_read: false,
    first_aid_consent: false,
    photo_video_consent: false,
    home_school_agreement: false,
    email_sms_contact_ack: false,
  },
]

describe('AttendanceForm', () => {
  it('renders all students', () => {
    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={students}
        existing={{}}
        role="admin"
        hasExisting={false}
        registerNotes={null}
        header={header}
      />,
    )

    expect(screen.getByText('Papadopoulos, Anna')).toBeTruthy()
    expect(screen.getByText('Georgiou, Nick')).toBeTruthy()
  })

  it('shows empty state when no students', () => {
    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={[]}
        existing={{}}
        role="admin"
        hasExisting={false}
        registerNotes={null}
        header={header}
      />,
    )
    expect(screen.getByText('No students in this class.')).toBeTruthy()
  })

  it('pre-fills existing attendance status', () => {
    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={students}
        existing={{ 'student-1': 'absent', 'student-2': 'late' }}
        role="admin"
        hasExisting={false}
        registerNotes={null}
        header={header}
      />,
    )
    expect(screen.getByText('0 present')).toBeTruthy()
    expect(screen.getByText('1 late')).toBeTruthy()
    expect(screen.getByText('1 absent')).toBeTruthy()
  })

  it('shows no selection by default when no existing status', () => {
    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={students}
        existing={{}}
        role="admin"
        hasExisting={false}
        registerNotes={null}
        header={header}
      />,
    )
    expect(screen.getByText('0 present')).toBeTruthy()
    expect(screen.getByText('2 unmarked')).toBeTruthy()
  })

  it('updates summary counts when status is toggled', () => {
    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={[students[0]]}
        existing={{}}
        role="admin"
        hasExisting={false}
        registerNotes={null}
        header={header}
      />,
    )

    expect(screen.getByText('1 unmarked')).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Absent' })[0])

    expect(screen.getByText('0 present')).toBeTruthy()
    expect(screen.getByText('1 absent')).toBeTruthy()
  })

  it('shows save register button', () => {
    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={students}
        existing={{}}
        role="admin"
        hasExisting={false}
        registerNotes={null}
        header={header}
      />,
    )
    expect(screen.getByText('Save register')).toBeTruthy()
  })

  it('calls saveAttendanceAction on form submit', async () => {
    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={[students[0]]}
        existing={{}}
        role="admin"
        hasExisting={false}
        registerNotes={null}
        header={header}
      />,
    )

    fireEvent.submit(screen.getByText('Save register').closest('form')!)

    await vi.waitFor(() => {
      expect(saveAttendanceAction).toHaveBeenCalledTimes(1)
    })
  })

  it('links each student name to their student page', () => {
    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={students}
        existing={{}}
        role="admin"
        hasExisting={false}
        registerNotes={null}
        header={header}
      />,
    )
    const link = screen.getByRole('link', { name: 'Papadopoulos, Anna' })
    expect(link.getAttribute('href')).toBe('/students/student-1')
  })

  it('shows disabled save button for secretary when hasExisting is true', () => {
    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={students}
        existing={{ 'student-1': 'present', 'student-2': 'present' }}
        role="secretary"
        hasExisting
        registerNotes={null}
        header={header}
      />,
    )

    // The save button is rendered as a non-interactive span (not a <button>)
    const saveText = screen.getByText('Save register')
    expect(saveText.tagName).not.toBe('BUTTON')
    expect(saveText.closest('span')).toBeTruthy()
  })

  it('shows enabled save button for secretary when hasExisting is false', () => {
    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={[students[0]]}
        existing={{}}
        role="secretary"
        hasExisting={false}
        registerNotes={null}
        header={header}
      />,
    )

    // Mark student so button is enabled
    fireEvent.click(screen.getAllByRole('button', { name: 'Present' })[0])

    const saveButton = screen.getByText('Save register')
    expect(saveButton.tagName).toBe('BUTTON')
  })

  it('shows an archived register as read-only', () => {
    render(
      <AttendanceForm
        classId="class-1"
        date="2026-06-01"
        students={[students[0]]}
        existing={{ 'student-1': 'present' }}
        role="admin"
        hasExisting
        registerNotes={null}
        archived
        header={header}
      />,
    )

    expect(
      screen.getByText(
        'This register is from a past academic year and is read-only.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText('Save register')).toBeNull()

    const absent = screen.getAllByRole('button', { name: 'Absent' })[0]
    expect((absent as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(absent)
    expect(screen.getByText('1 present')).toBeTruthy()
    expect(screen.getByText('0 absent')).toBeTruthy()
  })

  it('shows the saved register notes, disables them when archived and submits them', async () => {
    const { unmount } = render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={[students[0]]}
        existing={{ 'student-1': 'present' }}
        role="admin"
        hasExisting
        registerNotes={'Fire drill\nLate start'}
        header={header}
      />,
    )
    const box = screen.getByLabelText('Notes (optional)') as HTMLTextAreaElement
    expect(box.name).toBe('registerNotes')
    expect(box.value).toBe('Fire drill\nLate start')
    expect(box.disabled).toBe(false)
    fireEvent.change(box, { target: { value: 'Changed' } })
    expect(box.value).toBe('Changed')
    unmount()

    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={[students[0]]}
        existing={{ 'student-1': 'present' }}
        role="admin"
        hasExisting
        registerNotes={null}
        archived
        header={header}
      />,
    )
    expect(
      (screen.getByLabelText('Notes (optional)') as HTMLTextAreaElement)
        .disabled,
    ).toBe(true)
  })

  it('refreshes the notes from the saved result', async () => {
    vi.mocked(saveAttendanceAction).mockResolvedValue({
      data: {
        classId: 'class-1',
        date: '2024-03-08',
        isUpdate: false,
        registerNotes: 'Trimmed',
        saved: [savedRow('student-1', 'present')],
      },
    } as never)

    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={[students[0]]}
        existing={{}}
        role="admin"
        hasExisting={false}
        registerNotes={null}
        header={header}
      />,
    )
    const box = screen.getByLabelText('Notes (optional)') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '  Trimmed  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Present' }))
    fireEvent.submit(screen.getByText('Save register').closest('form')!)

    expect(await screen.findByText('Register saved.')).toBeTruthy()
    expect(box.value).toBe('Trimmed')
    const sent = vi.mocked(saveAttendanceAction).mock.calls[0][0]
    expect(sent.get('registerNotes')).toBe('  Trimmed  ')
  })

  it('shows the header with the already-taken notice for a taken register', () => {
    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={[students[0]]}
        existing={{ 'student-1': 'present' }}
        role="admin"
        hasExisting
        registerNotes={null}
        header={header}
      />,
    )

    expect(screen.getByText(/Year 3A/)).toBeTruthy()
    expect(screen.getByText('Historical')).toBeTruthy()
    expect(screen.getByText('(register already taken)')).toBeTruthy()
  })

  it('updates in place from the saved rows: notice, statuses and "Register saved."', async () => {
    vi.mocked(saveAttendanceAction).mockResolvedValue({
      data: {
        classId: 'class-1',
        date: '2024-03-08',
        isUpdate: false,
        registerNotes: null,
        saved: [savedRow('student-1', 'late')],
      },
    } as never)

    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={[students[0]]}
        existing={{}}
        role="admin"
        hasExisting={false}
        registerNotes={null}
        header={header}
      />,
    )
    expect(screen.queryByText('(register already taken)')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Present' }))
    fireEvent.submit(screen.getByText('Save register').closest('form')!)

    expect(await screen.findByText('Register saved.')).toBeTruthy()
    expect(screen.getByText('(register already taken)')).toBeTruthy()
    // The row as written wins over the local tap.
    expect(screen.getByText('1 late')).toBeTruthy()
    expect(screen.getByText('0 present')).toBeTruthy()
  })

  it('locks the register after the first save for a role that cannot update', async () => {
    vi.mocked(saveAttendanceAction).mockResolvedValue({
      data: {
        classId: 'class-1',
        date: '2024-03-08',
        isUpdate: false,
        registerNotes: null,
        saved: [savedRow('student-1', 'present')],
      },
    } as never)

    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={[students[0]]}
        existing={{}}
        role="secretary"
        hasExisting={false}
        registerNotes={null}
        header={header}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Present' }))
    fireEvent.submit(screen.getByText('Save register').closest('form')!)

    expect(await screen.findByText('Register saved.')).toBeTruthy()
    expect(screen.getByText('Save register').tagName).not.toBe('BUTTON')
  })

  it('keeps the taps and shows the error when the save fails', async () => {
    vi.mocked(saveAttendanceAction).mockResolvedValue({
      error: 'Failed to save attendance. Please try again.',
    })

    render(
      <AttendanceForm
        classId="class-1"
        date="2024-03-08"
        students={[students[0]]}
        existing={{}}
        role="admin"
        hasExisting={false}
        registerNotes={null}
        header={header}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Absent' }))
    fireEvent.submit(screen.getByText('Save register').closest('form')!)

    expect(
      await screen.findByText('Failed to save attendance. Please try again.'),
    ).toBeTruthy()
    expect(screen.getByText('1 absent')).toBeTruthy()
    expect(screen.queryByText('Register saved.')).toBeNull()
    expect(screen.queryByText('(register already taken)')).toBeNull()
  })
})
