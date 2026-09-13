import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { StudentFeeAccountRow } from '@/db'

import StudentFeesForm from './StudentFeesForm'

const planOptions = [
  { id: 'p1', label: 'Standard (2025-26)' },
  { id: 'p2', label: 'Sibling (2025-26)' },
]

function customWrapper(): HTMLElement {
  return screen.getByLabelText('Agreed total (£)').parentElement as HTMLElement
}

describe('StudentFeesForm', () => {
  it('starts with no plan and hides the custom fields', () => {
    render(
      <StudentFeesForm
        account={null}
        planOptions={planOptions}
        action={vi.fn()}
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
        planOptions={planOptions}
        action={vi.fn()}
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

  it('submits and confirms the save', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    render(
      <StudentFeesForm
        account={null}
        planOptions={planOptions}
        action={action}
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
  })

  it('shows an action error', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'Bad plan' })
    render(<StudentFeesForm account={null} planOptions={[]} action={action} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save fee account' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Bad plan'),
    )
    expect(screen.queryByRole('status')).toBeNull()
  })
})
