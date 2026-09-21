import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

import {
  getAcademicYears,
  getCurrentAcademicYear,
  getAcademicYearById,
  getAcademicYearForDate,
  createAcademicYear,
  updateAcademicYear,
  setCurrentAcademicYear,
} from './academic-years'

const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('./client', () => ({
  supabase: { from: mockFrom, rpc: mockRpc },
}))

type Result = { data?: unknown; error?: unknown }
type Chain = Record<string, Mock> & PromiseLike<Result>

function chain(result: Result): Chain {
  const target: Record<string, unknown> = {
    then: (
      onFulfilled?: (v: Result) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  for (const m of ['select', 'eq', 'order', 'insert', 'update']) {
    target[m] = vi.fn(() => target)
  }
  target.single = vi.fn(() => Promise.resolve(result))
  return target as unknown as Chain
}

const years = [
  {
    id: 'y2',
    code: '2026-27',
    start_date: '2026-09-01',
    end_date: '2027-08-31',
    is_current: true,
  },
  {
    id: 'y1',
    code: '2025-26',
    start_date: '2025-09-01',
    end_date: '2026-08-31',
    is_current: false,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getAcademicYears', () => {
  it('orders by start_date descending', async () => {
    const c = chain({ data: years })
    mockFrom.mockReturnValue(c)

    expect(await getAcademicYears()).toEqual(years)
    expect(c.order).toHaveBeenCalledWith('start_date', { ascending: false })
  })

  it('returns an empty array when there is no data', async () => {
    mockFrom.mockReturnValue(chain({ data: null }))
    expect(await getAcademicYears()).toEqual([])
  })
})

describe('getCurrentAcademicYear', () => {
  it('returns the current year', async () => {
    mockFrom.mockReturnValue(chain({ data: years }))
    expect(await getCurrentAcademicYear()).toEqual(years[0])
  })

  it('throws when no year is marked current', async () => {
    mockFrom.mockReturnValue(
      chain({ data: years.map((y) => ({ ...y, is_current: false })) }),
    )
    await expect(getCurrentAcademicYear()).rejects.toThrow(
      'No current academic year is set',
    )
  })
})

describe('getAcademicYearById', () => {
  it('finds the year by id', async () => {
    mockFrom.mockReturnValue(chain({ data: years }))
    expect(await getAcademicYearById('y1')).toEqual(years[1])
  })

  it('returns null when not found', async () => {
    mockFrom.mockReturnValue(chain({ data: years }))
    expect(await getAcademicYearById('missing')).toBeNull()
  })
})

describe('getAcademicYearForDate', () => {
  it('finds the year whose range contains the date', async () => {
    mockFrom.mockReturnValue(chain({ data: years }))
    expect((await getAcademicYearForDate('2025-10-01'))?.id).toBe('y1')
  })

  it('returns null when no year contains the date', async () => {
    mockFrom.mockReturnValue(chain({ data: years }))
    expect(await getAcademicYearForDate('2020-01-01')).toBeNull()
  })
})

describe('createAcademicYear', () => {
  it('inserts the year', async () => {
    const c = chain({ data: { id: 'y3' }, error: null })
    mockFrom.mockReturnValue(c)

    const input = {
      code: '2027-28',
      start_date: '2027-09-01',
      end_date: '2028-08-31',
    }
    expect(await createAcademicYear(input)).toEqual({ id: 'y3' })
    expect(c.insert).toHaveBeenCalledWith(input)
  })

  it('throws on error', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: new Error('dup') }))
    await expect(
      createAcademicYear({
        code: '2027-28',
        start_date: '2027-09-01',
        end_date: '2028-08-31',
      }),
    ).rejects.toThrow('dup')
  })
})

describe('updateAcademicYear', () => {
  it('updates the dates', async () => {
    const c = chain({ error: null })
    mockFrom.mockReturnValue(c)

    await updateAcademicYear('y1', {
      start_date: '2025-09-01',
      end_date: '2026-08-31',
    })
    expect(c.eq).toHaveBeenCalledWith('id', 'y1')
  })

  it('throws on error', async () => {
    mockFrom.mockReturnValue(chain({ error: new Error('bad') }))
    await expect(
      updateAcademicYear('y1', { start_date: 'x', end_date: 'y' }),
    ).rejects.toThrow('bad')
  })
})

describe('setCurrentAcademicYear', () => {
  it('calls the RPC', async () => {
    mockRpc.mockResolvedValue({ error: null })

    await setCurrentAcademicYear('y1')
    expect(mockRpc).toHaveBeenCalledWith('set_current_academic_year', {
      p_id: 'y1',
    })
  })

  it('throws on error', async () => {
    mockRpc.mockResolvedValue({ error: new Error('not found') })
    await expect(setCurrentAcademicYear('missing')).rejects.toThrow('not found')
  })
})
