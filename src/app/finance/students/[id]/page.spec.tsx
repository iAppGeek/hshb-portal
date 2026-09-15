import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { auth } from '@/auth'
import {
  getAcademicYears,
  getCurrentAcademicYear,
  getFeePlans,
  getStudentFeeDetail,
  getStudentFeeYears,
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
  getAcademicYears: vi.fn(),
  getCurrentAcademicYear: vi.fn(),
  getStudentFeeDetail: vi.fn(),
  getStudentFeeYears: vi.fn(),
  getFeePlans: vi.fn(),
}))
vi.mock('@/lib/datetime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/datetime')>()),
  todayInSchoolTz: () => '2025-10-15',
}))
vi.mock('../../../_components/YearSelector', () => ({
  default: () => <div data-testid="year-selector" />,
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

const CURRENT_YEAR = {
  id: 'year-1',
  code: '2025-26',
  start_date: '2025-09-01',
  end_date: '2026-08-31',
}

function makePlan(overrides: Partial<FeePlanWithClasses>): FeePlanWithClasses {
  return {
    id: 'p1',
    name: 'Standard',
    academic_year: CURRENT_YEAR,
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
      active: true,
      leaving_reason: null,
    },
    classes: [{ id: 'c1', name: 'Alpha' }],
    account: {
      id: 'acc',
      student_id: 's1',
      academic_year_id: CURRENT_YEAR.id,
      payment_plan: 'monthly',
      payment_plan_notes: null,
      fee_plan_override_id: null,
      custom_total_amount: null,
      custom_up_to_date: false,
      settled: false,
      settled_note: null,
      created_at: '',
      updated_at: '',
    },
    payments: [
      {
        id: 'pay1',
        student_id: 's1',
        academic_year_id: CURRENT_YEAR.id,
        amount: 100,
        payment_date: '2025-09-01',
        reference: 'REF-1',
        method: 'bank_transfer',
        notes: null,
        recorded_by: 'a1',
        created_at: '',
        recorder: { first_name: 'Ada', last_name: 'Admin' },
      },
    ],
    ...overrides,
  }
}

const params = Promise.resolve({ id: 's1' })

function noSearchParams() {
  return { params, searchParams: Promise.resolve({}) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as never)
  vi.mocked(getAcademicYears).mockResolvedValue([CURRENT_YEAR] as never)
  vi.mocked(getCurrentAcademicYear).mockResolvedValue(CURRENT_YEAR as never)
  vi.mocked(getStudentFeeYears).mockResolvedValue([])
  vi.mocked(getFeePlans).mockResolvedValue([
    makePlan({}),
    makePlan({ id: 'p2', name: 'Retired', active: false, class_ids: [] }),
  ])
  vi.mocked(getStudentFeeDetail).mockResolvedValue(makeDetail({}))
})

describe('StudentFeesPage', () => {
  it('redirects non-admins to the dashboard', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'secretary' } } as never)
    await expect(StudentFeesPage(noSearchParams())).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard',
    )
  })

  it('redirects to the students tab when the student is missing', async () => {
    vi.mocked(getStudentFeeDetail).mockResolvedValue(null)
    await expect(StudentFeesPage(noSearchParams())).rejects.toThrow(
      'NEXT_REDIRECT:/finance?tab=students',
    )
  })

  it('summarises the fee status from the class plan', async () => {
    render(await StudentFeesPage(noSearchParams()))

    expect(getStudentFeeDetail).toHaveBeenCalledWith('s1', CURRENT_YEAR.id)
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

  it('shows a leaver badge next to the name for an inactive student', async () => {
    vi.mocked(getStudentFeeDetail).mockResolvedValue(
      makeDetail({
        student: {
          id: 's1',
          first_name: 'Alice',
          last_name: 'Student',
          student_code: 'A-1',
          active: false,
          leaving_reason: 'graduated',
        },
      }),
    )

    render(await StudentFeesPage(noSearchParams()))

    expect(screen.getByText('Graduated')).toBeTruthy()
  })

  it('does not show a leaver badge for an active student', async () => {
    render(await StudentFeesPage(noSearchParams()))

    expect(screen.queryByText('Left')).toBeNull()
    expect(screen.queryByText('Graduated')).toBeNull()
    expect(screen.queryByText('Transferred')).toBeNull()
  })

  it('lists payments for the selected year', async () => {
    render(await StudentFeesPage(noSearchParams()))

    expect(screen.getByText('REF-1')).toBeTruthy()
    expect(screen.getByText('Bank transfer')).toBeTruthy()
    expect(screen.getByText('Ada Admin')).toBeTruthy()
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

    render(await StudentFeesPage(noSearchParams()))

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
          { id: 'c1', name: 'Alpha' },
          { id: 'c2', name: 'Beta' },
        ],
      }),
    )

    render(await StudentFeesPage(noSearchParams()))

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
          active: true,
          leaving_reason: null,
        },
        classes: [],
        account: null,
        payments: [],
      }),
    )

    render(await StudentFeesPage(noSearchParams()))

    expect(screen.getByText('No classes this year')).toBeTruthy()
    expect(screen.getByText(/Attach a class to a fee plan/)).toBeTruthy()
    expect(screen.getByText('No payments recorded.')).toBeTruthy()
    expect(screen.getByText('— / —')).toBeTruthy()
  })

  it('shows an other years table when the student has history in other years', async () => {
    const previousYear = {
      id: 'year-0',
      code: '2024-25',
      start_date: '2024-09-01',
      end_date: '2025-08-31',
    }
    vi.mocked(getStudentFeeYears).mockResolvedValue([
      {
        year: CURRENT_YEAR,
        classes: [{ id: 'c1', name: 'Alpha' }],
        account: null,
        payments: [],
      },
      {
        year: previousYear,
        classes: [],
        account: {
          id: 'acc-0',
          student_id: 's1',
          academic_year_id: previousYear.id,
          payment_plan: 'yearly',
          payment_plan_notes: null,
          fee_plan_override_id: null,
          custom_total_amount: null,
          custom_up_to_date: false,
          settled: true,
          settled_note: 'Written off',
          created_at: '',
          updated_at: '',
        },
        payments: [{ amount: 200, payment_date: '2024-10-01' }],
      },
    ] as never)
    vi.mocked(getFeePlans).mockImplementation(async (yearId?: string) =>
      yearId === previousYear.id
        ? [makePlan({ academic_year: previousYear, class_ids: [] })]
        : [makePlan({})],
    )

    render(await StudentFeesPage(noSearchParams()))

    expect(screen.getByText('Other years')).toBeTruthy()
    expect(screen.getByText('2024-25')).toBeTruthy()
    expect(screen.getByText('Settled')).toBeTruthy()
  })

  it('falls back to the current year for an unknown year', async () => {
    render(
      await StudentFeesPage({
        params,
        searchParams: Promise.resolve({ year: 'not-a-year' }),
      }),
    )

    expect(getStudentFeeDetail).toHaveBeenCalledWith('s1', CURRENT_YEAR.id)
  })

  it('links back to the students tab for the selected year', async () => {
    render(await StudentFeesPage(noSearchParams()))

    expect(
      screen.getByRole('link', { name: '← Student fees' }).getAttribute('href'),
    ).toBe(`/finance?tab=students&year=${CURRENT_YEAR.id}`)
  })
})
