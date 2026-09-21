import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import type {
  AcademicYearRow,
  FeePlanWithClasses,
  StudentFeeAccountRow,
  StudentFeeYear,
  StudentPaymentWithRecorder,
} from '@/db'

import StudentFeesPanel from './StudentFeesPanel'

// The children are covered by their own specs; here each is a button that
// reports the result the real one would, so the panel's state is what's tested.
const savedAccount = vi.hoisted(() => ({ current: null as unknown }))
const addedPayment = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('./StudentFeesForm', () => ({
  default: ({ onSaved }: { onSaved: (a: unknown) => void }) => (
    <button type="button" onClick={() => onSaved(savedAccount.current)}>
      Save fee account
    </button>
  ),
}))
vi.mock('./PaymentForm', () => ({
  default: ({ onAdded }: { onAdded: (p: unknown) => void }) => (
    <button type="button" onClick={() => onAdded(addedPayment.current)}>
      Record payment
    </button>
  ),
}))
vi.mock('./DeletePaymentButton', () => ({
  default: ({
    paymentId,
    reference,
    onDeleted,
  }: {
    paymentId: string
    reference: string
    onDeleted: (id: string) => void
  }) => (
    <button type="button" onClick={() => onDeleted(paymentId)}>
      Delete {reference}
    </button>
  ),
}))

const CURRENT = {
  id: 'year-1',
  code: '2025-26',
  start_date: '2025-09-01',
  end_date: '2026-08-31',
  is_current: true,
  created_at: '2025-01-01T00:00:00Z',
} as AcademicYearRow
const PRIOR = {
  id: 'year-0',
  code: '2024-25',
  start_date: '2024-09-01',
  end_date: '2025-08-31',
  is_current: false,
  created_at: '2024-01-01T00:00:00Z',
} as AcademicYearRow

const plan: FeePlanWithClasses = {
  id: 'plan-1',
  name: 'Standard',
  academic_year: CURRENT,
  full_year_amount: 600,
  monthly_instalment_amount: 60,
  termly_instalment_amount: 200,
  notes: null,
  active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  class_ids: ['c1'],
}

function makeAccount(
  overrides: Partial<StudentFeeAccountRow>,
): StudentFeeAccountRow {
  return {
    id: 'acc-1',
    student_id: 's1',
    academic_year_id: CURRENT.id,
    payment_plan: null,
    payment_plan_notes: null,
    fee_plan_override_id: null,
    custom_total_amount: null,
    custom_up_to_date: false,
    settled: false,
    settled_note: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makePayment(
  overrides: Partial<StudentPaymentWithRecorder>,
): StudentPaymentWithRecorder {
  return {
    id: 'pay-1',
    student_id: 's1',
    academic_year_id: CURRENT.id,
    amount: 100,
    payment_date: '2025-10-01',
    reference: 'REF-1',
    method: 'cash',
    notes: null,
    recorded_by: 'staff-1',
    created_at: '2025-10-01T09:00:00Z',
    updated_at: '2025-10-01T09:00:00Z',
    recorder: { first_name: 'Ada', last_name: 'Admin' },
    ...overrides,
  } as StudentPaymentWithRecorder
}

function renderPanel({
  account = null,
  payments = [],
  history = [],
}: {
  account?: StudentFeeAccountRow | null
  payments?: StudentPaymentWithRecorder[]
  history?: StudentFeeYear[]
} = {}): void {
  render(
    <StudentFeesPanel
      studentId="s1"
      yearId={CURRENT.id}
      today="2025-10-15"
      years={[CURRENT, PRIOR]}
      classes={[{ id: 'c1', name: 'Alpha' }]}
      plans={[plan]}
      plansByYear={{}}
      initialAccount={account}
      initialPayments={payments}
      initialHistory={history}
      saveAccountAction={vi.fn()}
      addPaymentAction={vi.fn()}
      deletePaymentAction={vi.fn()}
    />,
  )
}

describe('StudentFeesPanel', () => {
  it('updates the status from the saved account without a reload', () => {
    savedAccount.current = makeAccount({ payment_plan: 'yearly' })
    renderPanel()
    expect(screen.getByTestId('fee-status').textContent).toBe('No plan')

    fireEvent.click(screen.getByRole('button', { name: 'Save fee account' }))

    expect(screen.getByTestId('fee-status').textContent).not.toBe('No plan')
    expect(screen.getByText('Yearly')).toBeTruthy()
  })

  it('adds a payment for this year to the list and the paid total', () => {
    addedPayment.current = makePayment({
      id: 'pay-2',
      reference: 'REF-2',
      amount: 50,
      payment_date: '2025-10-10',
    })
    renderPanel({ payments: [makePayment({})] })
    expect(screen.getByTestId('paid-to-date').textContent).toBe('£100.00')

    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    expect(screen.getByTestId('paid-to-date').textContent).toBe('£150.00')
    const deletes = screen.getAllByRole('button', { name: /^Delete / })
    // Newest first, as the page loads them.
    expect(deletes.map((b) => b.textContent)).toEqual([
      'Delete REF-2',
      'Delete REF-1',
    ])
  })

  it('shows a payment for another year under Other years, not this year', () => {
    addedPayment.current = makePayment({
      id: 'pay-old',
      academic_year_id: PRIOR.id,
      amount: 40,
      payment_date: '2025-06-01',
    })
    renderPanel()
    expect(screen.queryByText('Other years')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    expect(screen.getByTestId('paid-to-date').textContent).toBe('£0.00')
    const otherYears = screen.getByText('Other years').parentElement!
    expect(within(otherYears).getByText(PRIOR.code)).toBeTruthy()
    expect(within(otherYears).getByText('£40.00')).toBeTruthy()
  })

  it('removes a deleted payment from the list and the paid total', () => {
    renderPanel({
      payments: [
        makePayment({ id: 'pay-1', reference: 'REF-1', amount: 100 }),
        makePayment({ id: 'pay-2', reference: 'REF-2', amount: 30 }),
      ],
    })
    expect(screen.getByTestId('paid-to-date').textContent).toBe('£130.00')

    fireEvent.click(screen.getByRole('button', { name: 'Delete REF-1' }))

    expect(screen.getByTestId('paid-to-date').textContent).toBe('£30.00')
    expect(screen.queryByRole('button', { name: 'Delete REF-1' })).toBeNull()
  })

  it('shows "No payments recorded." once the last payment is deleted', () => {
    renderPanel({ payments: [makePayment({})] })

    fireEvent.click(screen.getByRole('button', { name: 'Delete REF-1' }))

    expect(screen.getByText('No payments recorded.')).toBeTruthy()
  })
})
