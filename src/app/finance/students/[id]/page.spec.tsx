import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { auth } from '@/auth'
import {
  getFeePlans,
  getStudentFeeDetail,
  type FeePlanWithClasses,
  type StudentFeeDetail,
} from '@/db'

import StudentFeesPage from './page'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock('@/db', () => ({
  getStudentFeeDetail: vi.fn(),
  getFeePlans: vi.fn(),
}))
vi.mock('@/lib/datetime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/datetime')>()),
  todayInSchoolTz: () => '2025-10-15',
}))
vi.mock('./actions', () => ({
  saveStudentFeeAccountAction: vi.fn(),
  addStudentPaymentAction: vi.fn(),
  deleteStudentPaymentAction: vi.fn(),
}))
vi.mock('./StudentFeesForm', () => ({
  default: ({ planOptions }: { planOptions: { label: string }[] }) => (
    <div data-testid="account-form">
      {planOptions.map((p) => p.label).join(';')}
    </div>
  ),
}))
vi.mock('./PaymentForm', () => ({
  default: ({ defaultDate }: { defaultDate: string }) => (
    <div data-testid="payment-form">{defaultDate}</div>
  ),
}))
vi.mock('./DeletePaymentButton', () => ({
  default: ({ reference }: { reference: string }) => (
    <button type="button">Delete {reference}</button>
  ),
}))

function makePlan(overrides: Partial<FeePlanWithClasses>): FeePlanWithClasses {
  return {
    id: 'p1',
    name: 'Standard',
    academic_year: '2025-26',
    full_year_amount: 800,
    monthly_instalment_amount: 100,
    termly_instalment_amount: 266.67,
    notes: null,
    active: true,
    created_at: '',
    updated_at: '',
    class_ids: ['c1'],
    ...overrides,
  }
}

function makeDetail(overrides: Partial<StudentFeeDetail>): StudentFeeDetail {
  return {
    student: {
      id: 's1',
      first_name: 'Alice',
      last_name: 'Student',
      student_code: 'A-1',
    },
    classes: [{ id: 'c1', name: 'Alpha', academic_year: '2025-26' }],
    account: {
      id: 'acc',
      student_id: 's1',
      payment_plan: 'monthly',
      payment_plan_notes: null,
      fee_plan_override_id: null,
      custom_total_amount: null,
      custom_up_to_date: false,
      created_at: '',
      updated_at: '',
    },
    payments: [
      {
        id: 'pay1',
        student_id: 's1',
        amount: 100,
        payment_date: '2025-09-01',
        reference: 'REF-1',
        method: 'bank_transfer',
        notes: null,
        recorded_by: 'a1',
        created_at: '',
        recorder: { first_name: 'Ada', last_name: 'Admin' },
      },
      {
        id: 'pay0',
        student_id: 's1',
        amount: 50,
        payment_date: '2025-06-01',
        reference: 'OLD-1',
        method: 'cash',
        notes: 'Summer',
        recorded_by: null,
        created_at: '',
        recorder: null,
      },
    ],
    ...overrides,
  }
}

const params = Promise.resolve({ id: 's1' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as never)
  vi.mocked(getFeePlans).mockResolvedValue([
    makePlan({}),
    makePlan({ id: 'p2', name: 'Retired', active: false, class_ids: [] }),
  ])
  vi.mocked(getStudentFeeDetail).mockResolvedValue(makeDetail({}))
})

describe('StudentFeesPage', () => {
  it('redirects non-admins to the dashboard', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'secretary' } } as never)
    await expect(StudentFeesPage({ params })).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard',
    )
  })

  it('redirects to the students tab when the student is missing', async () => {
    vi.mocked(getStudentFeeDetail).mockResolvedValue(null)
    await expect(StudentFeesPage({ params })).rejects.toThrow(
      'NEXT_REDIRECT:/finance?tab=students',
    )
  })

  it('summarises the fee status from the class plan', async () => {
    render(await StudentFeesPage({ params }))

    expect(screen.getByRole('heading', { name: 'Student, Alice' })).toBeTruthy()
    expect(screen.getByText('A-1 · Alpha')).toBeTruthy()
    expect(screen.getByTestId('fee-status').textContent).toBe('Behind')
    expect(screen.getByTestId('fee-plan').textContent).toBe(
      'Standard (2025-26) · from class',
    )
    expect(screen.getByText('Monthly')).toBeTruthy()
    expect(screen.getByText('Paid in 2025-26')).toBeTruthy()
    expect(screen.getByTestId('paid-to-date').textContent).toBe('£100.00')
    expect(screen.getByText('£200.00 / £800.00')).toBeTruthy()
    // Inactive plans are not offered unless already the override
    expect(screen.getByTestId('account-form').textContent).toBe(
      'Standard (2025-26)',
    )
    expect(screen.getByTestId('payment-form').textContent).toBe('2025-10-15')
  })

  it('lists payments and marks those outside the plan year', async () => {
    render(await StudentFeesPage({ params }))

    const current = within(
      screen.getByText('REF-1').closest('tr') as HTMLElement,
    )
    expect(current.getByText('Bank transfer')).toBeTruthy()
    expect(current.getByText('Ada Admin')).toBeTruthy()
    expect(current.queryByText('Other year')).toBeNull()

    const old = within(screen.getByText('OLD-1').closest('tr') as HTMLElement)
    expect(old.getByText('Other year')).toBeTruthy()
    expect(old.getByText('Summer')).toBeTruthy()
    expect(old.getByText('Cash')).toBeTruthy()
  })

  it('shows an override, including an inactive one, in the options', async () => {
    const detail = makeDetail({})
    vi.mocked(getStudentFeeDetail).mockResolvedValue({
      ...detail,
      account: detail.account && {
        ...detail.account,
        fee_plan_override_id: 'p2',
      },
    })

    render(await StudentFeesPage({ params }))

    expect(screen.getByTestId('fee-plan').textContent).toBe(
      'Retired (2025-26) · override',
    )
    expect(screen.getByTestId('account-form').textContent).toBe(
      'Standard (2025-26);Retired (2025-26)',
    )
  })

  it('explains a plan conflict', async () => {
    vi.mocked(getFeePlans).mockResolvedValue([
      makePlan({}),
      makePlan({ id: 'p3', name: 'Sibling', class_ids: ['c2'] }),
    ])
    vi.mocked(getStudentFeeDetail).mockResolvedValue(
      makeDetail({
        classes: [
          { id: 'c1', name: 'Alpha', academic_year: '2025-26' },
          { id: 'c2', name: 'Beta', academic_year: '2025-26' },
        ],
      }),
    )

    render(await StudentFeesPage({ params }))

    expect(screen.getByTestId('fee-plan').textContent).toContain(
      'Standard (2025-26), Sibling (2025-26)',
    )
    expect(screen.getByTestId('fee-status').textContent).toBe('No plan')
  })

  it('handles a student with no classes, account or payments', async () => {
    vi.mocked(getStudentFeeDetail).mockResolvedValue(
      makeDetail({
        student: {
          id: 's1',
          first_name: 'Alice',
          last_name: 'Student',
          student_code: null,
        },
        classes: [],
        account: null,
        payments: [],
      }),
    )

    render(await StudentFeesPage({ params }))

    expect(screen.getByText('No active classes')).toBeTruthy()
    expect(screen.getByText(/Attach a class to a fee plan/)).toBeTruthy()
    expect(screen.getByText('No payments recorded.')).toBeTruthy()
    expect(screen.getByText('— / —')).toBeTruthy()
  })
})
