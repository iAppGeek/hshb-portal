import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import type { ComplianceSummary } from '@/lib/hrStatus'

import ComplianceSummaryCard from './ComplianceSummaryCard'

function makeSummary(
  overrides: Partial<ComplianceSummary> = {},
): ComplianceSummary {
  return {
    overall: { level: 'ok', reasons: [] },
    pendingActions: 0,
    staff: { ok: 5, warning: 0, error: 0 },
    staffStatus: { level: 'ok', reasons: [] },
    firstAiders: { count: 4, status: { level: 'ok', reasons: [] } },
    fireWardens: { count: 2, status: { level: 'ok', reasons: [] } },
    noCurrentYear: false,
    ...overrides,
  }
}

describe('ComplianceSummaryCard', () => {
  it('shows counts and an OK overall status', () => {
    render(<ComplianceSummaryCard summary={makeSummary()} />)
    const card = within(screen.getByRole('region', { name: 'HR compliance' }))

    expect(card.getByText('OK')).toBeInTheDocument()
    expect(card.getByText('5 OK · 0 warning · 0 action')).toBeInTheDocument()
    expect(card.getByText('4 of 4')).toBeInTheDocument()
    expect(card.getByText('2 of 2')).toBeInTheDocument()
    expect(card.queryByRole('button')).toBeNull()
    expect(card.queryByRole('link')).toBeNull()
  })

  it('makes each non-ok status explainable', () => {
    render(
      <ComplianceSummaryCard
        summary={makeSummary({
          overall: { level: 'error', reasons: ['1 staff need action'] },
          staff: { ok: 3, warning: 1, error: 1 },
          staffStatus: { level: 'error', reasons: ['1 staff need action'] },
          firstAiders: {
            count: 3,
            status: {
              level: 'warning',
              reasons: ['3 valid first aiders; at least 4 are needed'],
            },
          },
        })}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Action needed' }),
    ).toHaveAttribute('data-level', 'error')
    expect(screen.getByRole('button', { name: '3 of 4' })).toHaveAttribute(
      'data-level',
      'warning',
    )
    expect(
      screen.getByRole('button', { name: '3 OK · 1 warning · 1 action' }),
    ).toBeInTheDocument()
  })
})
