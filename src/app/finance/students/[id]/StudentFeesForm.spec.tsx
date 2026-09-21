import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { StudentFeeAccountRow } from '@/db'

import StudentFeesForm from './StudentFeesForm'

const planOptions = [
  { id: 'p1', label: 'Standard (2025-26)' },
  { id: 'p2', label: 'Sibling (2025-26)' },
]

function customWrapper(): HTMLElement {
  // The `hidden` attribute lives on the wrapper around the TextField, one
  // level above the TextField's own label/input wrapper.
  return screen.getByLabelText('Agreed total (£)').parentElement
    ?.parentElement as HTMLElement
}

describe('StudentFeesForm', () => {
  it('starts with no plan and hides the custom fields', () => {
    render(
      <StudentFeesForm
        account={null}
        academicYearId="year-1"
        planOptions={planOptions}
        action={vi.fn()}
        onSaved={vi.fn()}
      />,
    )

    expect(
      (screen.getByLabelText('Payment plan') as HTMLSelectElement).value,
    ).toBe('')
    expect(
      (screen.getByLabelText('Fee plan override') as HTMLSelectElement).value,
    ).toBe('')
    expect(
      screen.getByRole('option', { name: 'Sibling (2025-26)' }),
    ).toBeTruthy()
    expect(customWrapper().hidden).toBe(true)
  })

  it('submits the year as a hidden field', () => {
    render(
      <StudentFeesForm
        account={null}
        academicYearId="year-1"
        planOptions={planOptions}
        action={vi.fn()}
        onSaved={vi.fn()}
      />,
    )

    const form = screen.getByText('Fee account').closest('form')!
    const hidden = form.querySelector(
      'input[name="academic_year_id"]',
    ) as HTMLInputElement
    expect(hidden.value).toBe('year-1')
  })

  it('shows the settled fields in every year', () => {
    render(
      <StudentFeesForm
        account={
          {
            settled: true,
            settled_note: 'Written off',
          } as StudentFeeAccountRow
        }
        academicYearId="year-0"
        planOptions={planOptions}
        action={vi.fn()}
        onSaved={vi.fn()}
      />,
    )

    expect(
      (screen.getByLabelText(/Settled \(written off/) as HTMLInputElement)
        .checked,
    ).toBe(true)
    expect(
      (screen.getByLabelText('Settled note') as HTMLTextAreaElement).value,
    ).toBe('Written off')
  })

  it('shows custom fields and the notes hint for a custom plan', () => {
    render(
      <StudentFeesForm
        account={
          {
            payment_plan: 'custom',
            fee_plan_override_id: 'p2',
            custom_total_amount: 250,
            custom_up_to_date: true,
            payment_plan_notes: 'Agreed',
          } as StudentFeeAccountRow
        }
        academicYearId="year-1"
        planOptions={planOptions}
        action={vi.fn()}
        onSaved={vi.fn()}
      />,
    )

    expect(customWrapper().hidden).toBe(false)
    expect(
      (screen.getByLabelText('Agreed total (£)') as HTMLInputElement).value,
    ).toBe('250')
    expect(
      (
        screen.getByLabelText(
          'Up to date with the custom arrangement',
        ) as HTMLInputElement
      ).checked,
    ).toBe(true)
    expect(screen.getByText(/Required for a custom plan/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Payment plan'), {
      target: { value: 'yearly' },
    })
    expect(customWrapper().hidden).toBe(true)
  })

  it('submits, confirms the save and hands back the saved account', async () => {
    const savedAccount = {
      id: 'acc-1',
      payment_plan: 'monthly',
    } as StudentFeeAccountRow
    const action = vi.fn().mockResolvedValue({ data: savedAccount })
    const onSaved = vi.fn()
    render(
      <StudentFeesForm
        account={null}
        academicYearId="year-1"
        planOptions={planOptions}
        action={action}
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByLabelText('Payment plan'), {
      target: { value: 'monthly' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save fee account' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Saved'),
    )
    const fd = action.mock.calls[0][0] as FormData
    expect(fd.get('payment_plan')).toBe('monthly')
    // Hidden custom fields are still submitted
    expect(fd.get('custom_total_amount')).toBe('')
    expect(onSaved).toHaveBeenCalledWith(savedAccount)
  })

  it('shows an action error', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'Bad plan' })
    render(
      <StudentFeesForm
        account={null}
        academicYearId="year-1"
        planOptions={[]}
        action={action}
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save fee account' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Bad plan'),
    )
    expect(screen.queryByRole('status')).toBeNull()
  })
})
