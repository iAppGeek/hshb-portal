import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { getAcademicYears, getStaffPayrollByStaffId } from '@/db'

import MyHrDataTile from './MyHrDataTile'

vi.mock('@/db', () => ({
  getStaffPayrollByStaffId: vi.fn(),
  getAcademicYears: vi.fn(),
}))

const TODAY = '2026-11-26'

const compliantAdminAssistant = {
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
  first_aid_certified: false,
  first_aid_expiry_date: null,
  fire_warden_certified: false,
  fire_warden_expiry_date: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAcademicYears).mockResolvedValue([
    { start_date: '2026-09-01', end_date: '2027-08-31', is_current: true },
  ] as never)
})

async function renderTile(): Promise<HTMLElement> {
  render(await MyHrDataTile({ staffId: 'staff-1', today: TODAY }))
  return screen.getByRole('region', { name: 'HR Data' })
}

describe('MyHrDataTile', () => {
  it('loads the signed-in person’s own record', async () => {
    vi.mocked(getStaffPayrollByStaffId).mockResolvedValue(
      compliantAdminAssistant as never,
    )
    await renderTile()
    expect(getStaffPayrollByStaffId).toHaveBeenCalledWith('staff-1')
  })

  it('shows OK with nothing to do when the record is complete', async () => {
    vi.mocked(getStaffPayrollByStaffId).mockResolvedValue(
      compliantAdminAssistant as never,
    )
    const tile = await renderTile()

    expect(tile).toHaveTextContent('OK')
    expect(tile).not.toHaveTextContent('Committee')
  })

  it('asks them to contact the Committee when there are open issues', async () => {
    vi.mocked(getStaffPayrollByStaffId).mockResolvedValue({
      ...compliantAdminAssistant,
      id_verified: false,
    } as never)
    const tile = await renderTile()

    expect(tile).toHaveTextContent('Action needed')
    expect(tile).toHaveTextContent('Please contact the Committee.')
  })

  it('names the area of each open issue', async () => {
    vi.mocked(getStaffPayrollByStaffId).mockResolvedValue({
      ...compliantAdminAssistant,
      job_role: 'teacher',
      address_line_1: null,
    } as never)
    const tile = await renderTile()

    const issues = within(tile).getByRole('list', { name: 'Open issues' })
    const items = within(issues).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      'DBS issue',
      'Personal data issue',
    ])
    expect(items[0].querySelector('[data-level]')).toHaveAttribute(
      'data-level',
      'error',
    )
    expect(items[1].querySelector('[data-level]')).toHaveAttribute(
      'data-level',
      'warning',
    )
  })

  it('lists no issues when the record is complete', async () => {
    vi.mocked(getStaffPayrollByStaffId).mockResolvedValue(
      compliantAdminAssistant as never,
    )
    const tile = await renderTile()
    expect(within(tile).queryByRole('list')).toBeNull()
  })

  it('does not reveal the reasons or link to the record', async () => {
    vi.mocked(getStaffPayrollByStaffId).mockResolvedValue({
      ...compliantAdminAssistant,
      address_line_1: null,
    } as never)
    const tile = await renderTile()

    expect(tile).toHaveTextContent('Warning')
    expect(tile).toHaveTextContent('Personal data issue')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(tile).not.toHaveTextContent('No address recorded')
  })

  it('treats a missing record as an open issue', async () => {
    vi.mocked(getStaffPayrollByStaffId).mockResolvedValue(null)
    const tile = await renderTile()

    expect(tile).toHaveTextContent('Action needed')
    expect(tile).toHaveTextContent('Please contact the Committee.')
  })
})
