import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import PaymentForm from './PaymentForm'

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
  it('defaults the payment date and lists every method', () => {
    render(<PaymentForm defaultDate="2026-09-13" action={vi.fn()} />)

    expect(field('Payment date').value).toBe('2026-09-13')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Bank transfer',
      'Cash',
      'Card',
      'Other',
    ])
  })

  it('submits the payment and clears the form on success', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    render(<PaymentForm defaultDate="2026-09-13" action={action} />)

    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    await waitFor(() => expect(field('Reference').value).toBe(''))
    const fd = action.mock.calls[0][0] as FormData
    expect(fd.get('amount')).toBe('75.25')
    expect(fd.get('method')).toBe('card')
    expect(fd.get('notes')).toBe('')
    expect(field('Payment date').value).toBe('2026-09-13')
  })

  it('keeps the entered values and shows an error on failure', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'Required' })
    render(<PaymentForm defaultDate="2026-09-13" action={action} />)

    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Required'),
    )
    expect(field('Reference').value).toBe('REF-9')
  })
})
