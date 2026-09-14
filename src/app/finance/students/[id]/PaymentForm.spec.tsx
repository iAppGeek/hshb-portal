import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import PaymentForm from './PaymentForm'

const years = [
  {
    id: 'year-1',
    code: '2025-26',
    start_date: '2025-09-01',
    end_date: '2026-08-31',
  },
  {
    id: 'year-2',
    code: '2026-27',
    start_date: '2026-09-01',
    end_date: '2027-08-31',
  },
]

function field(label: string): HTMLInputElement {
  return screen.getByLabelText(label, { exact: false }) as HTMLInputElement
}

function fill(): void {
  fireEvent.change(field('Amount (£)'), { target: { value: '75.25' } })
  fireEvent.change(field('Reference'), { target: { value: 'REF-9' } })
  fireEvent.change(screen.getByLabelText('Method', { exact: false }), {
    target: { value: 'card' },
  })
}

describe('PaymentForm', () => {
  it('defaults the payment date, year and lists every method', () => {
    render(
      <PaymentForm
        defaultDate="2026-09-13"
        years={years}
        defaultYearId="year-2"
        action={vi.fn()}
      />,
    )

    expect(field('Payment date').value).toBe('2026-09-13')
    expect(
      (screen.getByLabelText('Pays for', { exact: false }) as HTMLSelectElement)
        .value,
    ).toBe('year-2')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '2025-26',
      '2026-27',
      'Bank transfer',
      'Cash',
      'Card',
      'Other',
    ])
  })

  it('switches the default year to match a date typed into a prior year', () => {
    render(
      <PaymentForm
        defaultDate="2026-09-13"
        years={years}
        defaultYearId="year-2"
        action={vi.fn()}
      />,
    )

    fireEvent.change(field('Payment date'), { target: { value: '2025-10-01' } })
    expect(
      (screen.getByLabelText('Pays for', { exact: false }) as HTMLSelectElement)
        .value,
    ).toBe('year-1')
  })

  it('submits the payment and clears the form on success', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    render(
      <PaymentForm
        defaultDate="2026-09-13"
        years={years}
        defaultYearId="year-2"
        action={action}
      />,
    )

    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    await waitFor(() => expect(field('Reference').value).toBe(''))
    const fd = action.mock.calls[0][0] as FormData
    expect(fd.get('amount')).toBe('75.25')
    expect(fd.get('method')).toBe('card')
    expect(fd.get('academic_year_id')).toBe('year-2')
    expect(fd.get('notes')).toBe('')
    expect(field('Payment date').value).toBe('2026-09-13')
  })

  it('keeps the entered values and shows an error on failure', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'Required' })
    render(
      <PaymentForm
        defaultDate="2026-09-13"
        years={years}
        defaultYearId="year-2"
        action={action}
      />,
    )

    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Required'),
    )
    expect(field('Reference').value).toBe('REF-9')
  })
})
