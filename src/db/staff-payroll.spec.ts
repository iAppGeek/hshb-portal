import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { updateTag } from 'next/cache'

import {
  getStaffPayrollList,
  getStaffPayrollByStaffId,
  upsertStaffPayroll,
} from './staff-payroll'

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

const METHODS = ['select', 'eq', 'order', 'upsert', 'single', 'maybeSingle']

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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getStaffPayrollList', () => {
  it('attaches payroll rows to staff and leaves others as null', async () => {
    const staff = [
      { id: 's1', title: 'Ms', first_name: 'A', last_name: 'A', role: 'admin' },
      {
        id: 's2',
        title: 'Mr',
        first_name: 'B',
        last_name: 'B',
        role: 'teacher',
      },
    ]
    const payroll = [{ id: 'p1', staff_id: 's2', payment_funding: 'kea' }]
    const tables: Record<string, Chain> = {
      staff: chain({ data: staff }),
      staff_payroll: chain({ data: payroll }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const result = await getStaffPayrollList()

    expect(result).toEqual([
      { ...staff[0], payroll: null },
      { ...staff[1], payroll: payroll[0] },
    ])
    expect(tables.staff.order).toHaveBeenCalledWith('last_name')
  })

  it('returns an empty list when queries return null', async () => {
    mockFrom.mockImplementation(() => chain({ data: null }))
    expect(await getStaffPayrollList()).toEqual([])
  })
})

describe('getStaffPayrollByStaffId', () => {
  it('queries by staff id', async () => {
    const row = { id: 'p1', staff_id: 's1' }
    const c = chain({ data: row })
    mockFrom.mockReturnValue(c)

    expect(await getStaffPayrollByStaffId('s1')).toEqual(row)
    expect(mockFrom).toHaveBeenCalledWith('staff_payroll')
    expect(c.eq).toHaveBeenCalledWith('staff_id', 's1')
  })
})

describe('upsertStaffPayroll', () => {
  it('upserts on staff_id and invalidates the cache', async () => {
    const row = { id: 'p1', staff_id: 's1', payment_funding: 'school' }
    const c = chain({ data: row, error: null })
    mockFrom.mockReturnValue(c)

    const result = await upsertStaffPayroll('s1', {
      payment_funding: 'school',
    })

    expect(result).toEqual(row)
    expect(c.upsert).toHaveBeenCalledWith(
      { payment_funding: 'school', staff_id: 's1' },
      { onConflict: 'staff_id' },
    )
    expect(updateTag).toHaveBeenCalledWith('staff-payroll')
  })

  it('throws and skips invalidation on error', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: new Error('boom') }))

    await expect(
      upsertStaffPayroll('s1', { payment_funding: 'kea' }),
    ).rejects.toThrow('boom')
    expect(updateTag).not.toHaveBeenCalled()
  })
})
