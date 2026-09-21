import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import type { StudentMatch } from '@/db'

import MatchStudentDialog from './MatchStudentDialog'

const students: StudentMatch[] = [
  {
    id: 'student-1',
    first_name: 'Alice',
    last_name: 'Student',
    date_of_birth: '2015-06-01',
    student_code: 'S001',
    active: true,
  },
  {
    id: 'student-2',
    first_name: 'Bob',
    last_name: 'Student',
    date_of_birth: '2016-01-01',
    student_code: null,
    active: true,
  },
]

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof MatchStudentDialog>> = {},
): void {
  render(
    <MatchStudentDialog
      title="Match to a student"
      confirmLabel="Apply opt-out"
      pendingLabel="Applying…"
      candidates={[students[0]]}
      students={students}
      allowNew={false}
      onConfirm={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
      {...overrides}
    />,
  )
}

describe('MatchStudentDialog', () => {
  describe('with allowNew: false', () => {
    it('renders inside the match-student-dialog test id with no create option', () => {
      renderDialog()
      expect(screen.getByTestId('match-student-dialog')).toBeTruthy()
      expect(screen.queryByRole('radio', { name: 'Create new student' })).toBe(
        null,
      )
    })

    it('pre-selects the first candidate', () => {
      renderDialog()
      expect(screen.getByText(/Selected: Student, Alice/)).toBeTruthy()
    })

    it('disables confirm until a student is selected', () => {
      renderDialog({ candidates: [] })
      expect(
        screen.getByRole('button', { name: 'Apply opt-out' }),
      ).toBeDisabled()
    })

    it('filters the student search after 5 characters and selects a result', () => {
      renderDialog({ candidates: [] })

      const search = screen.getByLabelText('Search all students')
      fireEvent.change(search, { target: { value: 'Bob' } })
      expect(screen.queryByRole('button', { name: /Student, Bob/ })).toBeNull()

      fireEvent.change(search, { target: { value: 'Bob Student' } })
      fireEvent.click(screen.getByRole('button', { name: /Student, Bob/ }))
      expect(screen.getByText(/Selected: Student, Bob/)).toBeTruthy()
      expect(
        screen.getByRole('button', { name: 'Apply opt-out' }),
      ).toBeEnabled()
    })

    it('switches candidates from the possible-matches select', async () => {
      const onConfirm = vi.fn().mockResolvedValue(undefined)
      renderDialog({ candidates: students, onConfirm })

      fireEvent.change(screen.getByLabelText('Possible matches'), {
        target: { value: 'student-2' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Apply opt-out' }))

      await waitFor(() =>
        expect(onConfirm).toHaveBeenCalledWith({
          mode: 'existing',
          studentId: 'student-2',
        }),
      )
    })

    it('shows the error returned by the action', async () => {
      renderDialog({
        onConfirm: vi.fn().mockResolvedValue({ error: 'Student not found' }),
      })

      fireEvent.click(screen.getByRole('button', { name: 'Apply opt-out' }))

      expect((await screen.findByRole('alert')).textContent).toBe(
        'Student not found',
      )
    })
  })

  describe('with allowNew: true', () => {
    it('defaults to creating a new student and confirms that choice', async () => {
      const onConfirm = vi.fn().mockResolvedValue(undefined)
      renderDialog({ allowNew: true, onConfirm, confirmLabel: 'Approve' })

      expect(
        (
          screen.getByRole('radio', {
            name: 'Create new student',
          }) as HTMLInputElement
        ).checked,
      ).toBe(true)
      expect(screen.queryByLabelText('Search all students')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
      await waitFor(() =>
        expect(onConfirm).toHaveBeenCalledWith({ mode: 'new' }),
      )
    })

    it('links to the pre-selected candidate after switching to existing', async () => {
      const onConfirm = vi.fn().mockResolvedValue(undefined)
      renderDialog({ allowNew: true, onConfirm, confirmLabel: 'Approve' })

      fireEvent.click(
        screen.getByRole('radio', { name: 'Link to existing student' }),
      )
      expect(screen.getByText(/Selected: Student, Alice/)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

      await waitFor(() =>
        expect(onConfirm).toHaveBeenCalledWith({
          mode: 'existing',
          studentId: 'student-1',
        }),
      )
    })
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
