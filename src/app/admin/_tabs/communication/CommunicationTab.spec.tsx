import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/db', () => ({
  getClassEmailRosters: vi.fn(),
}))
vi.mock('./CommunicationPanel', () => ({
  default: ({
    yearCode,
    classes,
  }: {
    yearCode: string
    classes: { name: string }[]
  }) => (
    <div data-testid="communication-panel">
      {yearCode}:{classes.map((cls) => cls.name).join(',')}
    </div>
  ),
}))

import { getClassEmailRosters } from '@/db'

import CommunicationTab from './CommunicationTab'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CommunicationTab', () => {
  it('passes the current year and class rosters to the panel', async () => {
    vi.mocked(getClassEmailRosters).mockResolvedValue({
      yearCode: '2026-27',
      classes: [
        {
          id: 'class-1',
          name: 'Year 3',
          teacherName: 'Jane Smith',
          teacherEmail: 'jane@hshb.org.uk',
          guardianEmails: ['a@x.com'],
        },
      ],
    })

    render(await CommunicationTab())

    expect(screen.getByTestId('communication-panel').textContent).toBe(
      '2026-27:Year 3',
    )
  })
})
