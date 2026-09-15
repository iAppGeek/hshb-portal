import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { updateTag } from 'next/cache'

import {
  getStudentFeeList,
  getStudentFeeDetail,
  getStudentFeeYears,
  getPriorYearBalances,
  upsertStudentFeeAccount,
  addStudentPayment,
  deleteStudentPayment,
} from './student-fees'

const mockFrom = vi.hoisted(() => vi.fn())
const mockGetAcademicYears = vi.hoisted(() => vi.fn())
const mockGetFeePlans = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  updateTag: vi.fn(),
}))

vi.mock('./client', () => ({
  supabase: { from: mockFrom },
}))

vi.mock('./academic-years', () => ({
  getAcademicYears: mockGetAcademicYears,
}))

vi.mock('./fee-plans', () => ({
  getFeePlans: mockGetFeePlans,
}))

type Result = { data?: unknown; error?: unknown }
type Chain = Record<string, Mock> & PromiseLike<Result>

const METHODS = [
  'select',
  'eq',
  'order',
  'range',
  'insert',
  'upsert',
  'delete',
  'single',
  'maybeSingle',
]

// Every builder method returns the chain; awaiting it resolves to `result`.
function chain(result: Result): Chain {
  const target: Record<string, unknown> = {
    then: (
      onFulfilled?: (v: Result) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  for (const m of METHODS) target[m] = vi.fn(() => target)
  return target as unknown as Chain
}

const alpha = { id: 'c1', name: 'Alpha' }

const years = [
  {
    id: 'y2',
    code: '2026-27',
    start_date: '2026-09-01',
    end_date: '2027-08-31',
  },
  {
    id: 'y1',
    code: '2025-26',
    start_date: '2025-09-01',
    end_date: '2026-08-31',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAcademicYears.mockResolvedValue(years)
  mockGetFeePlans.mockResolvedValue([])
})

describe('getStudentFeeList', () => {
  it('joins this year’s classes, accounts and payments per student', async () => {
    const tables: Record<string, Chain> = {
      students: chain({
        data: [
          {
            id: 's1',
            first_name: 'Alice',
            last_name: 'A',
            student_code: null,
            active: true,
            leaving_reason: null,
          },
          {
            id: 's2',
            first_name: 'Bob',
            last_name: 'B',
            student_code: 'B1',
            active: true,
            leaving_reason: null,
          },
        ],
      }),
      student_classes: chain({
        data: [
          {
            student_id: 's1',
            start_date: '2026-09-01',
            end_date: null,
            class: alpha,
          },
          {
            student_id: 's2',
            start_date: '2026-09-01',
            end_date: null,
            class: null,
          },
        ],
      }),
      student_fee_accounts: chain({
        data: [{ student_id: 's1', payment_plan: 'monthly' }],
      }),
      student_payments: chain({
        data: [{ student_id: 's1', amount: 100, payment_date: '2025-09-01' }],
        error: null,
      }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const result = await getStudentFeeList('y2')

    expect(result).toEqual([
      {
        id: 's1',
        first_name: 'Alice',
        last_name: 'A',
        student_code: null,
        active: true,
        leaving_reason: null,
        classes: [alpha],
        account: { student_id: 's1', payment_plan: 'monthly' },
        payments: [{ amount: 100, payment_date: '2025-09-01' }],
      },
      {
        id: 's2',
        first_name: 'Bob',
        last_name: 'B',
        student_code: 'B1',
        active: true,
        leaving_reason: null,
        classes: [],
        account: null,
        payments: [],
      },
    ])
    expect(tables.students.eq).not.toHaveBeenCalled()
    expect(tables.student_classes.eq).toHaveBeenCalledWith(
      'class.academic_year_id',
      'y2',
    )
    expect(tables.student_fee_accounts.eq).toHaveBeenCalledWith(
      'academic_year_id',
      'y2',
    )
    expect(tables.student_payments.eq).toHaveBeenCalledWith(
      'academic_year_id',
      'y2',
    )
    expect(tables.student_payments.range).toHaveBeenCalledWith(0, 999)
  })

  it('keeps a leaver who has a class, account or payment in the year', async () => {
    const tables: Record<string, Chain> = {
      students: chain({
        data: [
          {
            id: 's1',
            first_name: 'Leaver',
            last_name: 'L',
            student_code: null,
            active: false,
            leaving_reason: 'left',
          },
        ],
      }),
      student_classes: chain({
        data: [
          {
            student_id: 's1',
            start_date: '2026-09-01',
            end_date: '2026-10-01',
            class: alpha,
          },
        ],
      }),
      student_fee_accounts: chain({ data: [] }),
      student_payments: chain({ data: [] }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const result = await getStudentFeeList('y2')
    expect(result).toHaveLength(1)
    expect(result[0].active).toBe(false)
    expect(result[0].leaving_reason).toBe('left')
  })

  it('drops an inactive student with no class, account or payment in the year', async () => {
    const tables: Record<string, Chain> = {
      students: chain({
        data: [
          {
            id: 's1',
            first_name: 'Gone',
            last_name: 'G',
            student_code: null,
            active: false,
            leaving_reason: 'left',
          },
        ],
      }),
      student_classes: chain({ data: [] }),
      student_fee_accounts: chain({ data: [] }),
      student_payments: chain({ data: [] }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    expect(await getStudentFeeList('y2')).toEqual([])
  })

  it('pages through payments beyond the 1000-row cap', async () => {
    const fullPage = Array.from({ length: 1000 }, () => ({
      student_id: 's1',
      amount: 1,
      payment_date: '2025-09-01',
    }))
    const payments = chain({ data: fullPage, error: null })
    let call = 0
    payments.range.mockImplementation(() =>
      call++ === 0 ? payments : chain({ data: [], error: null }),
    )
    const tables: Record<string, Chain> = {
      students: chain({
        data: [
          { id: 's1', first_name: 'A', last_name: 'A', student_code: null },
        ],
      }),
      student_classes: chain({ data: null }),
      student_fee_accounts: chain({ data: null }),
      student_payments: payments,
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const [student] = await getStudentFeeList('y1')

    expect(student.payments).toHaveLength(1000)
    expect(payments.range).toHaveBeenNthCalledWith(2, 1000, 1999)
  })

  it('throws when the payments query fails', async () => {
    const tables: Record<string, Chain> = {
      students: chain({ data: [] }),
      student_classes: chain({ data: [] }),
      student_fee_accounts: chain({ data: [] }),
      student_payments: chain({ data: null, error: new Error('down') }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    await expect(getStudentFeeList('y1')).rejects.toThrow('down')
  })
})

describe('getStudentFeeDetail', () => {
  it('returns null when the student does not exist', async () => {
    mockFrom.mockReturnValue(chain({ data: null }))
    expect(await getStudentFeeDetail('missing', 'y1')).toBeNull()
  })

  it('returns the student, this year’s classes, account and payments', async () => {
    const payment = {
      id: 'pay1',
      amount: 100,
      recorder: { first_name: 'Ann', last_name: 'Admin' },
    }
    const tables: Record<string, Chain> = {
      students: chain({
        data: {
          id: 's1',
          first_name: 'Alice',
          last_name: 'A',
          student_code: null,
          active: true,
          leaving_reason: null,
        },
      }),
      student_classes: chain({
        data: [
          {
            student_id: 's1',
            start_date: '2026-09-01',
            end_date: null,
            class: alpha,
          },
        ],
      }),
      student_fee_accounts: chain({ data: null }),
      student_payments: chain({ data: [payment] }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    expect(await getStudentFeeDetail('s1', 'y1')).toEqual({
      student: {
        id: 's1',
        first_name: 'Alice',
        last_name: 'A',
        student_code: null,
        active: true,
        leaving_reason: null,
      },
      classes: [alpha],
      account: null,
      payments: [payment],
    })
    expect(tables.student_payments.order).toHaveBeenCalledWith('payment_date', {
      ascending: false,
    })
  })

  it('defaults missing enrolments and payments to empty lists', async () => {
    const tables: Record<string, Chain> = {
      students: chain({
        data: {
          id: 's1',
          first_name: 'A',
          last_name: 'A',
          student_code: null,
          active: true,
          leaving_reason: null,
        },
      }),
      student_classes: chain({ data: null }),
      student_fee_accounts: chain({ data: null }),
      student_payments: chain({ data: null }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const result = await getStudentFeeDetail('s1', 'y1')
    expect(result?.classes).toEqual([])
    expect(result?.payments).toEqual([])
  })
})

describe('getStudentFeeYears', () => {
  it('returns only years with a class, an account or a payment, newest first', async () => {
    const tables: Record<string, Chain> = {
      student_classes: chain({
        data: [
          {
            start_date: '2026-09-01',
            end_date: null,
            class: { id: 'c1', name: 'Alpha', academic_year_id: 'y2' },
          },
        ],
      }),
      student_fee_accounts: chain({
        data: [{ academic_year_id: 'y1', payment_plan: 'monthly' }],
      }),
      student_payments: chain({ data: [] }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const result = await getStudentFeeYears('s1')

    expect(result).toEqual([
      {
        year: years[0],
        classes: [{ id: 'c1', name: 'Alpha' }],
        account: null,
        payments: [],
      },
      {
        year: years[1],
        classes: [],
        account: { academic_year_id: 'y1', payment_plan: 'monthly' },
        payments: [],
      },
    ])
  })
})

describe('getPriorYearBalances', () => {
  it('sums unsettled prior-year balances above zero', async () => {
    mockGetFeePlans.mockResolvedValue([
      {
        id: 'p1',
        active: true,
        academic_year: {
          code: '2025-26',
          start_date: '2025-09-01',
          end_date: '2026-08-31',
        },
        full_year_amount: 800,
        monthly_instalment_amount: 100,
        termly_instalment_amount: 266.67,
        class_ids: ['c1'],
      },
    ])
    const tables: Record<string, Chain> = {
      students: chain({
        data: [
          { id: 's1', first_name: 'A', last_name: 'A', student_code: null },
        ],
      }),
      student_classes: chain({
        data: [
          {
            student_id: 's1',
            start_date: '2025-09-01',
            end_date: null,
            class: alpha,
          },
        ],
      }),
      student_fee_accounts: chain({
        data: [{ student_id: 's1', payment_plan: 'yearly', settled: false }],
      }),
      student_payments: chain({
        data: [{ student_id: 's1', amount: 300, payment_date: '2025-09-01' }],
      }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const result = await getPriorYearBalances('y2')
    expect(result).toEqual({ s1: 500 })
  })

  it('excludes settled accounts', async () => {
    mockGetFeePlans.mockResolvedValue([
      { id: 'p1', active: true, full_year_amount: 800, class_ids: ['c1'] },
    ])
    const tables: Record<string, Chain> = {
      students: chain({
        data: [
          { id: 's1', first_name: 'A', last_name: 'A', student_code: null },
        ],
      }),
      student_classes: chain({
        data: [
          {
            student_id: 's1',
            start_date: '2025-09-01',
            end_date: null,
            class: alpha,
          },
        ],
      }),
      student_fee_accounts: chain({
        data: [{ student_id: 's1', payment_plan: 'yearly', settled: true }],
      }),
      student_payments: chain({ data: [] }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    expect(await getPriorYearBalances('y2')).toEqual({})
  })

  it('counts an inactive class plan', async () => {
    mockGetFeePlans.mockResolvedValue([
      {
        id: 'p1',
        active: false,
        academic_year: {
          code: '2025-26',
          start_date: '2025-09-01',
          end_date: '2026-08-31',
        },
        full_year_amount: 800,
        monthly_instalment_amount: 100,
        termly_instalment_amount: 266.67,
        class_ids: ['c1'],
      },
    ])
    const tables: Record<string, Chain> = {
      students: chain({
        data: [
          { id: 's1', first_name: 'A', last_name: 'A', student_code: null },
        ],
      }),
      student_classes: chain({
        data: [
          {
            student_id: 's1',
            start_date: '2025-09-01',
            end_date: null,
            class: alpha,
          },
        ],
      }),
      student_fee_accounts: chain({
        data: [{ student_id: 's1', payment_plan: 'yearly', settled: false }],
      }),
      student_payments: chain({ data: [] }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    expect(await getPriorYearBalances('y2')).toEqual({ s1: 800 })
  })

  it('returns an empty record when there are no prior years', async () => {
    mockFrom.mockImplementation(() => chain({ data: [] }))
    expect(await getPriorYearBalances('y1')).toEqual({})
  })
})

describe('upsertStudentFeeAccount', () => {
  const input = {
    payment_plan: 'monthly',
    payment_plan_notes: null,
    fee_plan_override_id: null,
    custom_total_amount: null,
    custom_up_to_date: false,
    settled: false,
    settled_note: null,
  }

  it('upserts on student_id + academic_year_id and invalidates the cache', async () => {
    const c = chain({ error: null })
    mockFrom.mockReturnValue(c)

    await upsertStudentFeeAccount('s1', 'y1', input)

    expect(c.upsert).toHaveBeenCalledWith(
      { ...input, student_id: 's1', academic_year_id: 'y1' },
      { onConflict: 'student_id,academic_year_id' },
    )
    expect(updateTag).toHaveBeenCalledWith('student-fees')
  })

  it('throws on error', async () => {
    mockFrom.mockReturnValue(chain({ error: new Error('bad') }))
    await expect(upsertStudentFeeAccount('s1', 'y1', input)).rejects.toThrow(
      'bad',
    )
    expect(updateTag).not.toHaveBeenCalled()
  })
})

describe('addStudentPayment', () => {
  const input = {
    amount: 50,
    payment_date: '2025-10-01',
    academic_year_id: 'y1',
    reference: 'REF',
    method: 'cash',
    notes: null,
    recorded_by: 'staff-1',
  }

  it('inserts the payment for the student', async () => {
    const c = chain({ data: { id: 'pay1' }, error: null })
    mockFrom.mockReturnValue(c)

    expect(await addStudentPayment('s1', input)).toEqual({ id: 'pay1' })
    expect(c.insert).toHaveBeenCalledWith({ ...input, student_id: 's1' })
    expect(updateTag).toHaveBeenCalledWith('student-fees')
  })

  it('throws on error', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: new Error('bad') }))
    await expect(addStudentPayment('s1', input)).rejects.toThrow('bad')
  })
})

describe('deleteStudentPayment', () => {
  it('deletes scoped to the student and reports success', async () => {
    const c = chain({ data: [{ id: 'pay1' }], error: null })
    mockFrom.mockReturnValue(c)

    expect(await deleteStudentPayment('s1', 'pay1')).toBe(true)
    expect(c.eq).toHaveBeenCalledWith('id', 'pay1')
    expect(c.eq).toHaveBeenCalledWith('student_id', 's1')
    expect(updateTag).toHaveBeenCalledWith('student-fees')
  })

  it('returns false when nothing matched', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }))
    expect(await deleteStudentPayment('s1', 'other')).toBe(false)
  })

  it('throws on error', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: new Error('bad') }))
    await expect(deleteStudentPayment('s1', 'pay1')).rejects.toThrow('bad')
  })
})
