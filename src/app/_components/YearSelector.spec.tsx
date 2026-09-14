import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useRouter } from 'next/navigation'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

import YearSelector from './YearSelector'

const years = [
  { id: 'year-2', code: '2026-27' },
  { id: 'year-1', code: '2025-26' },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('YearSelector', () => {
  it('renders an option for every year', () => {
    render(<YearSelector years={years} value="year-2" basePath="/classes" />)

    expect(screen.getByText('2026-27')).toBeTruthy()
    expect(screen.getByText('2025-26')).toBeTruthy()
  })

  it('navigates to the base path with the chosen year', () => {
    const push = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push } as any)

    render(<YearSelector years={years} value="year-2" basePath="/classes" />)

    fireEvent.change(screen.getByLabelText('Academic year'), {
      target: { value: 'year-1' },
    })

    expect(push).toHaveBeenCalledWith('/classes?year=year-1')
  })

  it('preserves extra query params when navigating', () => {
    const push = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push } as any)

    render(
      <YearSelector
        years={years}
        value="year-2"
        basePath="/finance"
        extraParams={{ tab: 'fee-plans' }}
      />,
    )

    fireEvent.change(screen.getByLabelText('Academic year'), {
      target: { value: 'year-1' },
    })

    expect(push).toHaveBeenCalledWith('/finance?tab=fee-plans&year=year-1')
  })
})
