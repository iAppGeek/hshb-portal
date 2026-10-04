import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { COPIED_RESET_MS, useCopyToClipboard } from './useCopyToClipboard'

describe('useCopyToClipboard', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(
    navigator,
    'clipboard',
  )
  let writeText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard)
    } else {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  })

  it('starts idle', () => {
    const { result } = renderHook(() => useCopyToClipboard())
    expect(result.current.status).toBe('idle')
  })

  it('copies the text and reverts to idle after the reset delay', async () => {
    const { result } = renderHook(() => useCopyToClipboard())

    await act(() => result.current.copy('hello'))
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(result.current.status).toBe('copied')

    act(() => vi.advanceTimersByTime(COPIED_RESET_MS))
    expect(result.current.status).toBe('idle')
  })

  it('reports a failure and keeps it until the next attempt', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const { result } = renderHook(() => useCopyToClipboard())

    await act(() => result.current.copy('hello'))
    expect(result.current.status).toBe('failed')

    act(() => vi.advanceTimersByTime(COPIED_RESET_MS))
    expect(result.current.status).toBe('failed')
  })

  it('shows a failure, not "copied", when a copy fails just after a success', async () => {
    const { result } = renderHook(() => useCopyToClipboard())

    await act(() => result.current.copy('hello'))
    writeText.mockRejectedValue(new Error('denied'))
    await act(() => result.current.copy('hello'))
    expect(result.current.status).toBe('failed')

    // The first copy's reset timer must not clear the failure.
    act(() => vi.advanceTimersByTime(COPIED_RESET_MS))
    expect(result.current.status).toBe('failed')
  })

  it('restarts the reset delay on a second copy', async () => {
    const { result } = renderHook(() => useCopyToClipboard())

    await act(() => result.current.copy('hello'))
    act(() => vi.advanceTimersByTime(COPIED_RESET_MS - 100))
    await act(() => result.current.copy('hello'))

    act(() => vi.advanceTimersByTime(100))
    expect(result.current.status).toBe('copied')

    act(() => vi.advanceTimersByTime(COPIED_RESET_MS - 100))
    expect(result.current.status).toBe('idle')
  })

  it('clears its timer on unmount', async () => {
    const { result, unmount } = renderHook(() => useCopyToClipboard())

    await act(() => result.current.copy('hello'))
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
