import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { complianceSummary } from '@/lib/hrStatus'

import { loadHrCompliance } from '../hr/_lib/loadHrCompliance'

import HrComplianceTile from './HrComplianceTile'

vi.mock('../hr/_lib/loadHrCompliance', () => ({ loadHrCompliance: vi.fn() }))

describe('HrComplianceTile', () => {
  it('loads the summary for today and links to the HR page', async () => {
    vi.mocked(loadHrCompliance).mockResolvedValue({
      staff: [],
      year: null,
      summary: complianceSummary([null], null, '2026-11-26'),
    })

    render(await HrComplianceTile({ today: '2026-11-26' }))

    expect(loadHrCompliance).toHaveBeenCalledWith('2026-11-26')
    expect(screen.getByRole('link', { name: 'HR compliance' })).toHaveAttribute(
      'href',
      '/hr',
    )
    expect(screen.getByText('0 OK · 0 warning · 1 action')).toBeInTheDocument()
  })
})
