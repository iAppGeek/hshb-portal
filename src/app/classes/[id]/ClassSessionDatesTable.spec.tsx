import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { getClassSessionDates } from '@/db'
import type { ClassSessionDate } from '@/lib/classSessions'

import ClassSessionDatesTable from './ClassSessionDatesTable'

vi.mock('@/db', () => ({
  getClassSessionDates: vi.fn(),
}))

const taken: ClassSessionDate = {
  date: '2026-10-17',
  taken: true,
  roster: 12,
  attended: 11,
  absent: 1,
}

const missed: ClassSessionDate = {
  date: '2026-10-16',
  taken: false,
  roster: 0,
  attended: 0,
  absent: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ClassSessionDatesTable', () => {
  it('renders nothing when there are no dates', async () => {
    vi.mocked(getClassSessionDates).mockResolvedValue([])
    const { container } = render(
      await ClassSessionDatesTable({
        classId: 'class-1',
        academicYearId: 'year-1',
      }),
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows taken and not-taken pills and the attendance text', async () => {
    vi.mocked(getClassSessionDates).mockResolvedValue([taken, missed])
    render(
      await ClassSessionDatesTable({
        classId: 'class-1',
        academicYearId: 'year-1',
      }),
    )

    expect(screen.getByText('Class Session Dates')).toBeTruthy()
    expect(screen.getByText('TAKEN').className).toContain(
      'bg-green-100 text-green-800',
    )
    expect(screen.getByText('NOT TAKEN').className).toContain(
      'bg-amber-100 text-amber-800',
    )
    expect(screen.getByText('92% · 11 attended / 1 absent')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })
})
