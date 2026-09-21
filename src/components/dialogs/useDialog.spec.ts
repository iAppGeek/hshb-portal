import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useDialog } from './useDialog'

describe('useDialog', () => {
  it('starts closed with no props', () => {
    const { result } = renderHook(() => useDialog<{ id: string }>())
    expect(result.current.isOpen).toBe(false)
    expect(result.current.props).toBeNull()
  })

  it('opens with the props it was given and closes again', () => {
    const { result } = renderHook(() => useDialog<{ id: string }>())

    act(() => result.current.open({ id: 'row-1' }))
    expect(result.current.isOpen).toBe(true)
    expect(result.current.props).toEqual({ id: 'row-1' })

    act(() => result.current.close())
    expect(result.current.isOpen).toBe(false)
    expect(result.current.props).toBeNull()
  })

  it('reopening replaces the props', () => {
    const { result } = renderHook(() => useDialog<string>())

    act(() => result.current.open('a'))
    act(() => result.current.open('b'))
    expect(result.current.props).toBe('b')
  })

  it('opens without arguments when it takes no props', () => {
    const { result } = renderHook(() => useDialog())

    act(() => result.current.open())
    expect(result.current.isOpen).toBe(true)
  })
})
