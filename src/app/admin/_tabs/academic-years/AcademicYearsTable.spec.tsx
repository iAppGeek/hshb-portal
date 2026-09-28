import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))
vi.mock('./MakeCurrentButton', () => ({
  default: ({
    yearCode,
    action,
    onMadeCurrent,
  }: {
    yearCode: string
    action: () => Promise<{ data: { currentId: string } } | void>
    onMadeCurrent: (id: string) => void
  }) => (
    <button
      onClick={async () => {
        const result = await action()
        if (result) onMadeCurrent(result.data.currentId)
      }}
    >
      Make current ({yearCode})
    </button>
  ),
}))

import AcademicYearsTable, {
  type AcademicYearTableRow,
} from './AcademicYearsTable'

const years: AcademicYearTableRow[] = [
  {
    id: 'year-2',
    code: '2026-27',
    start_date: '2026-09-01',
    end_date: '2027-08-31',
    is_current: true,
    classCount: 3,
    feePlanCount: 1,
  },
  {
    id: 'year-1',
    code: '2025-26',
    start_date: '2025-09-01',
    end_date: '2026-08-31',
    is_current: false,
    classCount: 5,
    feePlanCount: 2,
  },
]

const makeCurrentAction = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AcademicYearsTable', () => {
  it('renders every year with a Current badge only on the current one', () => {
    render(
      <AcademicYearsTable
        years={years}
        makeCurrentAction={makeCurrentAction}
      />,
    )

    expect(screen.getByText('2026-27')).toBeTruthy()
    expect(screen.getByText('2025-26')).toBeTruthy()
    expect(screen.getByText('Current')).toBeTruthy()
  })

  it('moves the Current badge when another year is made current', async () => {
    makeCurrentAction.mockResolvedValue({ data: { currentId: 'year-1' } })
    render(
      <AcademicYearsTable
        years={years}
        makeCurrentAction={makeCurrentAction}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByText('Make current (2025-26)'))
    })

    expect(makeCurrentAction).toHaveBeenCalledWith('year-1', 'year-2')
    expect(screen.getAllByText('Current')).toHaveLength(1)
    expect(screen.getByText('Make current (2026-27)')).toBeTruthy()
    expect(screen.queryByText('Make current (2025-26)')).toBeNull()
  })

  it('warns when no year is marked current, until one is made current', async () => {
    makeCurrentAction.mockResolvedValue({ data: { currentId: 'year-1' } })
    render(
      <AcademicYearsTable
        years={years.map((y) => ({ ...y, is_current: false }))}
        makeCurrentAction={makeCurrentAction}
      />,
    )
    expect(screen.getByText(/no academic year is marked current/i)).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByText('Make current (2025-26)'))
    })

    expect(makeCurrentAction).toHaveBeenCalledWith('year-1', null)
    expect(screen.queryByText(/no academic year is marked current/i)).toBeNull()
  })

  it('does not show Make current for the current year', () => {
    render(
      <AcademicYearsTable
        years={years}
        makeCurrentAction={makeCurrentAction}
      />,
    )

    expect(screen.queryByText('Make current (2026-27)')).toBeNull()
    expect(screen.getByText('Make current (2025-26)')).toBeTruthy()
  })

  it("links Edit to the year's edit page", () => {
    render(
      <AcademicYearsTable
        years={years}
        makeCurrentAction={makeCurrentAction}
      />,
    )

    const editLinks = screen.getAllByRole('link', { name: 'Edit' })
    expect(editLinks[1].getAttribute('href')).toBe(
      '/admin/academic-years/year-1/edit',
    )
  })
})
