import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import EnrolmentHistoryTable from './EnrolmentHistoryTable'

describe('EnrolmentHistoryTable', () => {
  it('renders nothing when there are no rows', () => {
    const { container } = render(<EnrolmentHistoryTable rows={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when every row has a deleted student', () => {
    const { container } = render(
      <EnrolmentHistoryTable
        rows={[
          {
            id: 'sc0',
            start_date: '2026-09-01',
            end_date: null,
            student: null,
          },
        ]}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows name as "Last, First", from and to dates', () => {
    render(
      <EnrolmentHistoryTable
        rows={[
          {
            id: 'sc1',
            start_date: '2026-09-01',
            end_date: '2026-10-01',
            student: { id: 's1', first_name: 'Alice', last_name: 'Smith' },
          },
        ]}
      />,
    )
    expect(screen.getByText('Smith, Alice')).toBeTruthy()
    expect(screen.getByText('01/09/2026')).toBeTruthy()
    expect(screen.getByText('01/10/2026')).toBeTruthy()
  })

  it('leaves the To column blank for an open row', () => {
    render(
      <EnrolmentHistoryTable
        rows={[
          {
            id: 'sc2',
            start_date: '2026-09-01',
            end_date: null,
            student: { id: 's1', first_name: 'Alice', last_name: 'Smith' },
          },
        ]}
      />,
    )
    const row = screen.getByText('Smith, Alice').closest('tr')!
    const cells = row.querySelectorAll('td')
    expect(cells[2].textContent).toBe('')
  })

  it('sorts open rows first, then by end_date desc, then last name', () => {
    render(
      <EnrolmentHistoryTable
        rows={[
          {
            id: 'sc3',
            start_date: '2025-09-01',
            end_date: '2026-01-01',
            student: { id: 's1', first_name: 'Zoe', last_name: 'Zephyr' },
          },
          {
            id: 'sc4',
            start_date: '2026-09-01',
            end_date: null,
            student: { id: 's2', first_name: 'Alice', last_name: 'Aardvark' },
          },
          {
            id: 'sc5',
            start_date: '2025-09-01',
            end_date: '2026-06-01',
            student: { id: 's3', first_name: 'Bob', last_name: 'Brown' },
          },
        ]}
      />,
    )
    const names = screen
      .getAllByRole('row')
      .slice(1) // skip header row
      .map((row) => row.querySelector('td')!.textContent)
    expect(names).toEqual(['Aardvark, Alice', 'Brown, Bob', 'Zephyr, Zoe'])
  })

  it('uses the enrolment row id as the key, not student+date, so re-enrolments on the same day stay distinct', () => {
    render(
      <EnrolmentHistoryTable
        rows={[
          {
            id: 'sc6',
            start_date: '2026-09-01',
            end_date: '2026-09-01',
            student: { id: 's1', first_name: 'Alice', last_name: 'Smith' },
          },
          {
            id: 'sc7',
            start_date: '2026-09-01',
            end_date: null,
            student: { id: 's1', first_name: 'Alice', last_name: 'Smith' },
          },
        ]}
      />,
    )
    expect(screen.getAllByText('Smith, Alice')).toHaveLength(2)
  })
})
