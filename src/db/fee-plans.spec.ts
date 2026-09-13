import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { updateTag } from 'next/cache'

import {
  getFeePlans,
  getFeePlanById,
  createFeePlan,
  updateFeePlan,
} from './fee-plans'

const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  updateTag: vi.fn(),
}))

vi.mock('./client', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}))

type Result = { data?: unknown; error?: unknown }
type Chain = Record<string, Mock> & PromiseLike<Result>

const METHODS = ['select', 'eq', 'order', 'maybeSingle']

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

const input = {
  name: 'Standard',
  academic_year: '2025-26',
  full_year_amount: 800,
  monthly_instalment_amount: 100,
  termly_instalment_amount: 266.67,
  notes: null,
  active: true,
}

const rpcArgs = {
  p_name: 'Standard',
  p_academic_year: '2025-26',
  p_full_year_amount: 800,
  p_monthly_instalment_amount: 100,
  p_termly_instalment_amount: 266.67,
  p_notes: null,
  p_active: true,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getFeePlans', () => {
  it('groups class ids under each plan', async () => {
    const tables: Record<string, Chain> = {
      fee_plans: chain({ data: [{ id: 'p1' }, { id: 'p2' }] }),
      fee_plan_classes: chain({
        data: [
          { fee_plan_id: 'p1', class_id: 'c1' },
          { fee_plan_id: 'p1', class_id: 'c2' },
        ],
      }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    expect(await getFeePlans()).toEqual([
      { id: 'p1', class_ids: ['c1', 'c2'] },
      { id: 'p2', class_ids: [] },
    ])
  })

  it('returns an empty list when queries return null', async () => {
    mockFrom.mockImplementation(() => chain({ data: null }))
    expect(await getFeePlans()).toEqual([])
  })
})

describe('getFeePlanById', () => {
  it('returns the plan with its class ids', async () => {
    const tables: Record<string, Chain> = {
      fee_plans: chain({ data: { id: 'p1', name: 'Standard' } }),
      fee_plan_classes: chain({ data: [{ class_id: 'c1' }] }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    expect(await getFeePlanById('p1')).toEqual({
      id: 'p1',
      name: 'Standard',
      class_ids: ['c1'],
    })
    expect(tables.fee_plan_classes.eq).toHaveBeenCalledWith('fee_plan_id', 'p1')
  })

  it('returns an empty class list when links come back null', async () => {
    const tables: Record<string, Chain> = {
      fee_plans: chain({ data: { id: 'p1' } }),
      fee_plan_classes: chain({ data: null }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])
    expect(await getFeePlanById('p1')).toEqual({ id: 'p1', class_ids: [] })
  })

  it('returns null when the plan does not exist', async () => {
    mockFrom.mockReturnValue(chain({ data: null }))
    expect(await getFeePlanById('missing')).toBeNull()
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })
})

describe('createFeePlan', () => {
  it('saves the plan and its classes in one RPC call', async () => {
    mockRpc.mockResolvedValue({ data: 'p1', error: null })

    expect(await createFeePlan(input, ['c1'])).toEqual({ id: 'p1' })
    expect(mockRpc).toHaveBeenCalledWith('save_fee_plan', {
      p_id: null,
      ...rpcArgs,
      p_class_ids: ['c1'],
    })
    expect(mockFrom).not.toHaveBeenCalled()
    expect(updateTag).toHaveBeenCalledWith('fee-plans')
  })

  it('throws and skips invalidation when the RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('dup') })
    await expect(createFeePlan(input, [])).rejects.toThrow('dup')
    expect(updateTag).not.toHaveBeenCalled()
  })
})

describe('updateFeePlan', () => {
  it('passes the plan id so the RPC updates and relinks classes', async () => {
    mockRpc.mockResolvedValue({ data: 'p1', error: null })

    await updateFeePlan('p1', input, [])

    expect(mockRpc).toHaveBeenCalledWith('save_fee_plan', {
      p_id: 'p1',
      ...rpcArgs,
      p_class_ids: [],
    })
    expect(updateTag).toHaveBeenCalledWith('fee-plans')
  })

  it('throws when the RPC fails', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Fee plan not found.' },
    })
    await expect(updateFeePlan('p1', input, ['c1'])).rejects.toEqual({
      code: 'P0001',
      message: 'Fee plan not found.',
    })
    expect(updateTag).not.toHaveBeenCalled()
  })
})
