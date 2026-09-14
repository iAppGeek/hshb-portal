import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./AcademicYearForm', () => ({
  default: ({ defaultValues }: { defaultValues: { code: string } }) => (
    <div data-testid="year-form">{defaultValues.code}</div>
  ),
}))
vi.mock('./MakeCurrentButton', () => ({
  default: ({ yearCode }: { yearCode: string }) => (
    <button>Make current ({yearCode})</button>
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

const updateAction = vi.fn()
const makeCurrentAction = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AcademicYearsTable', () => {
  it('renders every year with a Current badge only on the current one', () => {
    render(
      <AcademicYearsTable
        years={years}
        updateAction={updateAction}
        makeCurrentAction={makeCurrentAction}
      />,
    )

    expect(screen.getByText('2026-27')).toBeTruthy()
    expect(screen.getByText('2025-26')).toBeTruthy()
    expect(screen.getByText('Current')).toBeTruthy()
  })

  it('does not show Make current for the current year', () => {
    render(
      <AcademicYearsTable
        years={years}
        updateAction={updateAction}
        makeCurrentAction={makeCurrentAction}
      />,
    )

    expect(screen.queryByText('Make current (2026-27)')).toBeNull()
    expect(screen.getByText('Make current (2025-26)')).toBeTruthy()
  })

  it('shows the edit form for a row when Edit is clicked', () => {
    render(
      <AcademicYearsTable
        years={years}
        updateAction={updateAction}
        makeCurrentAction={makeCurrentAction}
      />,
    )

    fireEvent.click(screen.getAllByText('Edit')[1])
    expect(screen.getByTestId('year-form').textContent).toBe('2025-26')
  })
})
