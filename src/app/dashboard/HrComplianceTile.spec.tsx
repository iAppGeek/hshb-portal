import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { complianceSummary } from '@/lib/hrStatus'

import { loadHrCompliance } from '../hr/_lib/loadHrCompliance'

import HrComplianceTile from './HrComplianceTile'

vi.mock('../hr/_lib/loadHrCompliance', () => ({ loadHrCompliance: vi.fn() }))

const YEAR = { start_date: '2026-09-01', end_date: '2027-08-31' }

function okRecord(): Parameters<typeof complianceSummary>[0][number] {
  return {
    job_role: 'admin_assistant',
    payment_funding: 'school',
    address_line_1: '1 High Street',
    id_verified: true,
    right_to_work_checked: true,
    dbs_verified: false,
    dbs_level: null,
    dbs_update_service: false,
    dbs_reference: null,
    dbs_issue_date: null,
    dbs_verified_at: null,
    dbs_renewal_due: null,
    first_aid_certified: true,
    first_aid_expiry_date: null,
    fire_warden_certified: true,
    fire_warden_expiry_date: null,
  }
}

describe('HrComplianceTile', () => {
  it('shows the overall status and pending actions, linking to the HR page', async () => {
    vi.mocked(loadHrCompliance).mockResolvedValue({
      staff: [],
      year: null,
      summary: complianceSummary([null], null, '2026-11-26'),
    })

    render(await HrComplianceTile({ today: '2026-11-26' }))

    expect(loadHrCompliance).toHaveBeenCalledWith('2026-11-26')
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/hr')
    expect(link).toHaveTextContent('HR compliance')
    expect(screen.getByText('Action needed')).toBeInTheDocument()
    // One person, no year, no first aiders, no fire wardens.
    expect(screen.getByText('4 pending actions')).toBeInTheDocument()
  })

  it('says there is nothing pending when all is OK', async () => {
    const records = [okRecord(), okRecord(), okRecord(), okRecord()]
    vi.mocked(loadHrCompliance).mockResolvedValue({
      staff: [],
      year: YEAR,
      summary: complianceSummary(records, YEAR, '2026-11-26'),
    })

    render(await HrComplianceTile({ today: '2026-11-26' }))

    expect(screen.getByText('OK')).toBeInTheDocument()
    expect(screen.getByText('No pending actions')).toBeInTheDocument()
  })

  it('uses the singular for one pending action', async () => {
    const records = [okRecord(), okRecord(), okRecord(), null]
    vi.mocked(loadHrCompliance).mockResolvedValue({
      staff: [],
      year: YEAR,
      summary: complianceSummary([...records, okRecord()], YEAR, '2026-11-26'),
    })

    render(await HrComplianceTile({ today: '2026-11-26' }))

    expect(screen.getByText('1 pending action')).toBeInTheDocument()
  })
})
