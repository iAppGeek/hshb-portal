import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import MakeCurrentButton from './MakeCurrentButton'

const mockAction = vi.fn()
const onMadeCurrent = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockAction.mockResolvedValue(undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MakeCurrentButton', () => {
  it('asks for confirmation naming the year', () => {
    render(
      <MakeCurrentButton
        yearCode="2026-27"
        action={mockAction}
        onMadeCurrent={onMadeCurrent}
      />,
    )

    fireEvent.click(screen.getByText('Make current'))
    expect(window.confirm).toHaveBeenCalledWith(
      'Make 2026-27 the current academic year?',
    )
  })

  it('reports the new current year once the action succeeds', async () => {
    mockAction.mockResolvedValue({ data: { currentId: 'year-2' } })
    render(
      <MakeCurrentButton
        yearCode="2026-27"
        action={mockAction}
        onMadeCurrent={onMadeCurrent}
      />,
    )

    fireEvent.click(screen.getByText('Make current'))
    await vi.waitFor(() => {
      expect(onMadeCurrent).toHaveBeenCalledWith('year-2')
    })
  })

  it('calls the action when confirmed', async () => {
    render(
      <MakeCurrentButton
        yearCode="2026-27"
        action={mockAction}
        onMadeCurrent={onMadeCurrent}
      />,
    )

    fireEvent.click(screen.getByText('Make current'))
    await vi.waitFor(() => {
      expect(mockAction).toHaveBeenCalled()
    })
  })

  it('does not call the action when the confirmation is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <MakeCurrentButton
        yearCode="2026-27"
        action={mockAction}
        onMadeCurrent={onMadeCurrent}
      />,
    )

    fireEvent.click(screen.getByText('Make current'))
    expect(mockAction).not.toHaveBeenCalled()
  })

  it('shows an error returned by the action', async () => {
    mockAction.mockResolvedValue({ error: 'Academic year not found' })
    render(
      <MakeCurrentButton
        yearCode="2026-27"
        action={mockAction}
        onMadeCurrent={onMadeCurrent}
      />,
    )

    fireEvent.click(screen.getByText('Make current'))
    await vi.waitFor(() => {
      expect(screen.getByText('Academic year not found')).toBeTruthy()
    })
    expect(onMadeCurrent).not.toHaveBeenCalled()
  })
})
