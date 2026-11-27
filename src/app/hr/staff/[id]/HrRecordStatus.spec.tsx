import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import HrRecordStatus from './HrRecordStatus'

describe('HrRecordStatus', () => {
  it('says there are no open issues when ok', () => {
    render(<HrRecordStatus status={{ level: 'ok', reasons: [] }} />)

    const panel = screen.getByRole('region', { name: 'HR status' })
    expect(panel).toHaveAttribute('data-level', 'ok')
    expect(panel).toHaveTextContent('OK: no open issues')
    expect(within(panel).queryByRole('list')).toBeNull()
  })

  it('lists every open issue', () => {
    render(
      <HrRecordStatus
        status={{
          level: 'error',
          reasons: ['ID has not been verified', 'No address recorded'],
        }}
      />,
    )

    const panel = screen.getByRole('region', { name: 'HR status' })
    expect(panel).toHaveAttribute('data-level', 'error')
    expect(panel).toHaveTextContent('Action needed: 2 open issues')
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['ID has not been verified', 'No address recorded'])
  })

  it('uses the singular for one warning', () => {
    render(
      <HrRecordStatus
        status={{ level: 'warning', reasons: ['No address recorded'] }}
      />,
    )

    expect(screen.getByRole('region', { name: 'HR status' })).toHaveTextContent(
      'Warning: 1 open issue',
    )
  })
})
