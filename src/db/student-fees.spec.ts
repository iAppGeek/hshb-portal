import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { updateTag } from 'next/cache'

import {
  getStudentFeeList,
  getStudentFeeDetail,
  upsertStudentFeeAccount,
  createStudentPayment,
  deleteStudentPayment,
} from './student-fees'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  updateTag: vi.fn(),
}))

vi.mock('./client', () => ({
  supabase: { from: mockFrom },
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

const alpha = { id: 'c1', name: 'Alpha', academic_year: '2025-26' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getStudentFeeList', () => {
  it('joins active classes, accounts and payments per student', async () => {
    const tables: Record<string, Chain> = {
      students: chain({
        data: [
          { id: 's1', first_name: 'Alice', last_name: 'A', student_code: null },
          { id: 's2', first_name: 'Bob', last_name: 'B', student_code: 'B1' },
        ],
      }),
      student_classes: chain({
        data: [
          { student_id: 's1', class: { ...alpha, active: true } },
          {
            student_id: 's1',
            class: {
              id: 'old',
              name: 'Old',
              academic_year: '2024-25',
              active: false,
            },
          },
          { student_id: 's2', class: null },
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

    const result = await getStudentFeeList()

    expect(result).toEqual([
      {
        id: 's1',
        first_name: 'Alice',
        last_name: 'A',
        student_code: null,
        classes: [alpha],
        account: { student_id: 's1', payment_plan: 'monthly' },
        payments: [{ amount: 100, payment_date: '2025-09-01' }],
      },
      {
        id: 's2',
        first_name: 'Bob',
        last_name: 'B',
        student_code: 'B1',
        classes: [],
        account: null,
        payments: [],
      },
    ])
    expect(tables.students.eq).toHaveBeenCalledWith('active', true)
    expect(tables.student_payments.range).toHaveBeenCalledWith(0, 999)
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

    const [student] = await getStudentFeeList()

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

    await expect(getStudentFeeList()).rejects.toThrow('down')
  })
})

describe('getStudentFeeDetail', () => {
  it('returns null when the student does not exist', async () => {
    mockFrom.mockReturnValue(chain({ data: null }))
    expect(await getStudentFeeDetail('missing')).toBeNull()
  })

  it('returns the student, active classes, account and payments', async () => {
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
        },
      }),
      student_classes: chain({
        data: [{ student_id: 's1', class: { ...alpha, active: true } }],
      }),
      student_fee_accounts: chain({ data: null }),
      student_payments: chain({ data: [payment] }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    expect(await getStudentFeeDetail('s1')).toEqual({
      student: {
        id: 's1',
        first_name: 'Alice',
        last_name: 'A',
        student_code: null,
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
        data: { id: 's1', first_name: 'A', last_name: 'A', student_code: null },
      }),
      student_classes: chain({ data: null }),
      student_fee_accounts: chain({ data: null }),
      student_payments: chain({ data: null }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const result = await getStudentFeeDetail('s1')
    expect(result?.classes).toEqual([])
    expect(result?.payments).toEqual([])
  })
})

describe('upsertStudentFeeAccount', () => {
  const input = {
    payment_plan: 'monthly',
    payment_plan_notes: null,
    fee_plan_override_id: null,
    custom_total_amount: null,
    custom_up_to_date: false,
  }

  it('upserts on student_id and invalidates the cache', async () => {
    const c = chain({ error: null })
    mockFrom.mockReturnValue(c)

    await upsertStudentFeeAccount('s1', input)

    expect(c.upsert).toHaveBeenCalledWith(
      { ...input, student_id: 's1' },
      { onConflict: 'student_id' },
    )
    expect(updateTag).toHaveBeenCalledWith('student-fees')
  })

  it('throws on error', async () => {
    mockFrom.mockReturnValue(chain({ error: new Error('bad') }))
    await expect(upsertStudentFeeAccount('s1', input)).rejects.toThrow('bad')
    expect(updateTag).not.toHaveBeenCalled()
  })
})

describe('createStudentPayment', () => {
  const input = {
    amount: 50,
    payment_date: '2025-10-01',
    reference: 'REF',
    method: 'cash',
    notes: null,
    recorded_by: 'staff-1',
  }

  it('inserts the payment for the student', async () => {
    const c = chain({ data: { id: 'pay1' }, error: null })
    mockFrom.mockReturnValue(c)

    expect(await createStudentPayment('s1', input)).toEqual({ id: 'pay1' })
    expect(c.insert).toHaveBeenCalledWith({ ...input, student_id: 's1' })
    expect(updateTag).toHaveBeenCalledWith('student-fees')
  })

  it('throws on error', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: new Error('bad') }))
    await expect(createStudentPayment('s1', input)).rejects.toThrow('bad')
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
