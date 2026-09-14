import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import AcademicYearForm from './AcademicYearForm'

const defaultValues = {
  code: '2027-28',
  start_date: '2027-09-01',
  end_date: '2028-08-31',
}

const mockAction = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockAction.mockResolvedValue(undefined)
})

describe('AcademicYearForm', () => {
  it('pre-fills the code, start and end date', () => {
    render(
      <AcademicYearForm
        mode="create"
        defaultValues={defaultValues}
        action={mockAction}
        submitLabel="Add year"
      />,
    )

    expect(screen.getByLabelText(/code/i)).toHaveValue('2027-28')
    expect(screen.getByLabelText(/start date/i)).toHaveValue('2027-09-01')
    expect(screen.getByLabelText(/end date/i)).toHaveValue('2028-08-31')
  })

  it('makes the code read-only in edit mode', () => {
    render(
      <AcademicYearForm
        mode="edit"
        defaultValues={defaultValues}
        action={mockAction}
        submitLabel="Save changes"
      />,
    )

    expect(screen.getByLabelText(/code/i)).toHaveAttribute('readonly')
  })

  it('does not mark the code read-only in create mode', () => {
    render(
      <AcademicYearForm
        mode="create"
        defaultValues={defaultValues}
        action={mockAction}
        submitLabel="Add year"
      />,
    )

    expect(screen.getByLabelText(/code/i)).not.toHaveAttribute('readonly')
  })

  it('calls the action on submit', async () => {
    render(
      <AcademicYearForm
        mode="create"
        defaultValues={defaultValues}
        action={mockAction}
        submitLabel="Add year"
      />,
    )

    fireEvent.submit(screen.getByText('Add year').closest('form')!)

    await vi.waitFor(() => {
      expect(mockAction).toHaveBeenCalled()
    })
  })

  it('shows an error returned by the action', async () => {
    mockAction.mockResolvedValue({
      error: 'End date must be after the start date',
    })

    render(
      <AcademicYearForm
        mode="create"
        defaultValues={defaultValues}
        action={mockAction}
        submitLabel="Add year"
      />,
    )

    fireEvent.submit(screen.getByText('Add year').closest('form')!)

    await vi.waitFor(() => {
      expect(
        screen.getByText('End date must be after the start date'),
      ).toBeTruthy()
    })
  })

  it('calls onDone when Cancel is clicked', () => {
    const onDone = vi.fn()
    render(
      <AcademicYearForm
        mode="edit"
        defaultValues={defaultValues}
        action={mockAction}
        submitLabel="Save changes"
        onDone={onDone}
      />,
    )

    fireEvent.click(screen.getByText('Cancel'))
    expect(onDone).toHaveBeenCalled()
  })
})
