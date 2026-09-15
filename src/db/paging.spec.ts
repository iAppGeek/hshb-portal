import { describe, it, expect, vi } from 'vitest'

import { fetchAllPages } from './paging'

describe('fetchAllPages', () => {
  it('returns all rows from a single short page', async () => {
    const page = vi.fn().mockResolvedValue({ data: [1, 2, 3], error: null })
    const result = await fetchAllPages(page)
    expect(result).toEqual([1, 2, 3])
    expect(page).toHaveBeenCalledTimes(1)
    expect(page).toHaveBeenCalledWith(0, 999)
  })

  it('stops paging once a short page is returned', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => i)
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: fullPage, error: null })
      .mockResolvedValueOnce({ data: [1000, 1001], error: null })

    const result = await fetchAllPages(page)
    expect(result).toHaveLength(1002)
    expect(page).toHaveBeenCalledTimes(2)
    expect(page).toHaveBeenNthCalledWith(2, 1000, 1999)
  })

  it('treats a null data page as empty and stops', async () => {
    const page = vi.fn().mockResolvedValue({ data: null, error: null })
    const result = await fetchAllPages(page)
    expect(result).toEqual([])
  })

  it('throws on error', async () => {
    const page = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('boom') })
    await expect(fetchAllPages(page)).rejects.toThrow('boom')
  })
})
