import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useSchoolClock } from './useSchoolClock'

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  // 08:14:30 GMT == 08:14 in London in winter.
  vi.setSystemTime(new Date('2026-01-15T08:14:30Z'))
})

afterEach(() => {
  vi.useRealTimers()
  setVisibility('visible')
})

describe('useSchoolClock', () => {
  it('starts from the initial time', () => {
    const { result } = renderHook(() => useSchoolClock('08:14', true))
    expect(result.current).toBe('08:14')
  })

  it('ticks on the next minute boundary, then every minute', () => {
    const onTick = vi.fn()
    const { result } = renderHook(() => useSchoolClock('08:14', true, onTick))

    act(() => vi.advanceTimersByTime(29_000))
    expect(result.current).toBe('08:14')
    expect(onTick).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current).toBe('08:15')
    expect(onTick).toHaveBeenCalledTimes(1)

    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current).toBe('08:16')
    expect(onTick).toHaveBeenCalledTimes(2)
  })

  it('stays put when not live', () => {
    const onTick = vi.fn()
    const { result } = renderHook(() => useSchoolClock('09:30', false, onTick))

    act(() => vi.advanceTimersByTime(5 * 60_000))
    setVisibility('visible')

    expect(result.current).toBe('09:30')
    expect(onTick).not.toHaveBeenCalled()
  })

  it('catches up as soon as the tab becomes visible again', () => {
    const onTick = vi.fn()
    const { result } = renderHook(() => useSchoolClock('08:14', true, onTick))

    // A sleeping tablet: the clock moves on but no timer has fired yet.
    vi.setSystemTime(new Date('2026-01-15T09:02:10Z'))
    act(() => setVisibility('hidden'))
    expect(onTick).not.toHaveBeenCalled()

    act(() => setVisibility('visible'))
    expect(result.current).toBe('09:02')
    expect(onTick).toHaveBeenCalledTimes(1)
  })

  it('stops ticking once unmounted', () => {
    const onTick = vi.fn()
    const { unmount } = renderHook(() => useSchoolClock('08:14', true, onTick))

    unmount()
    act(() => vi.advanceTimersByTime(5 * 60_000))
    setVisibility('visible')

    expect(onTick).not.toHaveBeenCalled()
  })
})
