import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import {
  getAcademicYears,
  getStaffPayrollList,
  type StaffPayrollListItem,
  type StaffPayrollRow,
} from '@/db'
import { NO_CURRENT_YEAR_MESSAGE } from '@/lib/hrStatus'

import StaffPayrollList from './StaffPayrollList'

vi.mock('@/db', () => ({
  getStaffPayrollList: vi.fn(),
  getAcademicYears: vi.fn(),
}))
vi.mock('@/lib/datetime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/datetime')>()),
  todayInSchoolTz: () => '2026-09-13',
}))

const CURRENT_YEAR = {
  id: 'y1',
  code: '2026-27',
  start_date: '2026-09-01',
  end_date: '2027-08-31',
  is_current: true,
}

function makePayroll(overrides: Partial<StaffPayrollRow>): StaffPayrollRow {
  return {
    id: 'p1',
    staff_id: 's1',
    payment_funding: 'school',
    job_role: 'teacher',
    date_of_birth: '1985-04-12',
    bank_account_name: null,
    bank_sort_code: null,
    bank_account_number: null,
    payroll_ref: 'PR-1',
    address_line_1: null,
    address_line_2: null,
    city: null,
    postcode: null,
    national_insurance_number: null,
    id_verified: false,
    id_verified_at: null,
    id_type: null,
    id_verified_by: null,
    right_to_work_checked: false,
    right_to_work_checked_at: null,
    dbs_verified: false,
    dbs_level: null,
    dbs_update_service: false,
    dbs_update_service_number: null,
    dbs_reference: null,
    dbs_issue_date: null,
    dbs_verified_at: null,
    dbs_renewal_due: null,
    dbs_verified_by: null,
    first_aid_certified: false,
    first_aid_issue_date: null,
    first_aid_verified_at: null,
    first_aid_expiry_date: null,
    first_aid_reference: null,
    fire_warden_certified: false,
    fire_warden_issue_date: null,
    fire_warden_verified_at: null,
    fire_warden_expiry_date: null,
    fire_warden_reference: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const compliant: Partial<StaffPayrollRow> = {
  id_verified: true,
  right_to_work_checked: true,
  dbs_verified: true,
  dbs_level: 'enhanced',
  dbs_reference: 'DBS-1',
  dbs_issue_date: '2025-06-01',
  dbs_verified_at: '2026-09-05',
  dbs_renewal_due: '2028-06-01',
}

function member(
  payroll: StaffPayrollRow | null,
  id = 's1',
): StaffPayrollListItem {
  return {
    id,
    title: 'Ms',
    first_name: 'Ann',
    last_name: 'Lee',
    role: 'teacher',
    payroll,
  }
}

// Each row holds a stacked summary cell for phones, then the desktop cells;
// jsdom applies no CSS, so tests pick the cell they mean.
const CELL = { stacked: 0, name: 1, dbs: 2, status: 3, actions: 4 } as const

function cell(
  column: keyof typeof CELL,
  rowId = 's1',
): ReturnType<typeof within> {
  const row = screen.getByTestId(`payroll-row-${rowId}`)
  return within(row.querySelectorAll('td')[CELL[column]] as HTMLElement)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAcademicYears).mockResolvedValue([CURRENT_YEAR] as never)
})

describe('StaffPayrollList', () => {
  it('shows an empty state with no staff', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([])
    render(await StaffPayrollList())
    expect(screen.getByText('No staff found.')).toBeTruthy()
  })

  it('shows only the name, DBS checked, status and edit columns', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      member(makePayroll(compliant)),
    ])
    render(await StaffPayrollList())

    const headers = screen
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(headers).toEqual([
      'Staff member',
      'DBS checked',
      'Status',
      'Actions',
    ])
  })

  it('shows a compliant member as OK with the DBS check date', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      member(makePayroll(compliant)),
    ])
    render(await StaffPayrollList())

    const rowEl = screen.getByTestId('payroll-row-s1')
    expect(cell('name').getByText('Ms Ann Lee')).toBeTruthy()
    expect(cell('dbs').getByText('5 Sept 2026')).toBeTruthy()
    expect(cell('status').getByText('OK')).toBeTruthy()
    expect(within(rowEl).queryByRole('button')).toBeNull()
    expect(
      cell('actions').getByRole('link', { name: 'Edit' }).getAttribute('href'),
    ).toBe('/hr/staff/s1')
    expect(rowEl.className).not.toContain('bg-red-50')
  })

  it('stacks the name, Edit and both statuses for phones', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      member(makePayroll({ ...compliant, dbs_level: 'basic' })),
    ])
    render(await StaffPayrollList())

    const summary = cell('stacked')
    expect(summary.getByText('Ms Ann Lee')).toBeTruthy()
    expect(summary.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/hr/staff/s1',
    )
    expect(summary.getByText('5 Sept 2026')).toBeTruthy()
    fireEvent.click(summary.getByRole('button', { name: 'Warning' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Basic DBS held')
  })

  it('flags staff without a record and links to add one', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([member(null)])
    render(await StaffPayrollList())

    expect(cell('dbs').getByText('Not checked')).toBeTruthy()
    fireEvent.click(
      cell('status').getByRole('button', { name: 'Action needed' }),
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('No HR record')
    expect(
      cell('actions').getByRole('link', { name: 'Add record' }),
    ).toBeTruthy()
  })

  it('marks a DBS checked in a previous school year as an error', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      member(makePayroll({ ...compliant, dbs_verified_at: '2026-06-01' })),
    ])
    render(await StaffPayrollList())

    const checked = cell('dbs').getByRole('button', { name: '1 Jun 2026' })
    expect(checked).toHaveAttribute('data-level', 'error')
    fireEvent.click(checked)
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'DBS has not been verified this school year',
    )
  })

  it('explains a warning status', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      member(makePayroll({ ...compliant, dbs_level: 'basic' })),
    ])
    render(await StaffPayrollList())

    const status = cell('status').getByRole('button', { name: 'Warning' })
    fireEvent.click(status)
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Basic DBS held; an enhanced DBS is required for this role',
    )
  })

  it('shows the compliance summary', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      member(makePayroll({ ...compliant, first_aid_certified: true })),
    ])
    render(await StaffPayrollList())

    const summary = within(
      screen.getByRole('region', { name: 'HR compliance' }),
    )
    expect(summary.getByText('1 OK · 0 warning · 0 action')).toBeTruthy()
    expect(summary.getByText('1 of 4')).toBeTruthy()
    expect(summary.getByText('0 of 2')).toBeTruthy()
  })

  it('warns when no academic year is current and shows DBS checks as errors', async () => {
    vi.mocked(getAcademicYears).mockResolvedValue([
      { ...CURRENT_YEAR, is_current: false },
    ] as never)
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      member(makePayroll(compliant)),
    ])
    render(await StaffPayrollList())

    expect(screen.getByRole('alert')).toHaveTextContent(NO_CURRENT_YEAR_MESSAGE)
    expect(
      cell('dbs').getByRole('button', { name: '5 Sept 2026' }),
    ).toHaveAttribute('data-level', 'error')
  })

  it('has no year banner when a year is current', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      member(makePayroll(compliant)),
    ])
    render(await StaffPayrollList())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('highlights a row whose Update Service subscription has lapsed', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      member(
        makePayroll({
          ...compliant,
          dbs_update_service: true,
          dbs_update_service_number: 'C0001',
          dbs_renewal_due: '2026-09-01',
        }),
      ),
    ])
    render(await StaffPayrollList())

    expect(screen.getByTestId('payroll-row-s1').className).toContain(
      'bg-red-50',
    )
  })

  it('matches the row highlight to the status for a certificate DBS', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      // A passed renewal date is ignored off the Update Service
      member(
        makePayroll({ ...compliant, dbs_renewal_due: '2026-09-01' }),
        's1',
      ),
      // Over three years old, whatever the renewal date says
      member(
        makePayroll({
          ...compliant,
          dbs_issue_date: '2023-06-01',
          dbs_renewal_due: '2030-01-01',
        }),
        's2',
      ),
    ])
    render(await StaffPayrollList())

    expect(screen.getByTestId('payroll-row-s1').className).not.toContain(
      'bg-red-50',
    )
    expect(cell('status', 's1').getByText('OK')).toBeTruthy()
    expect(screen.getByTestId('payroll-row-s2').className).toContain(
      'bg-red-50',
    )
    expect(
      cell('status', 's2').getByRole('button', { name: 'Action needed' }),
    ).toBeTruthy()
  })

  it('highlights a row with an expired first aid or fire warden certificate', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      member(
        makePayroll({
          first_aid_certified: true,
          first_aid_expiry_date: '2026-01-01',
        }),
        's1',
      ),
      member(
        makePayroll({
          fire_warden_certified: true,
          fire_warden_expiry_date: '2025-01-01',
        }),
        's2',
      ),
    ])
    render(await StaffPayrollList())

    expect(screen.getByTestId('payroll-row-s1').className).toContain(
      'bg-red-50',
    )
    expect(screen.getByTestId('payroll-row-s2').className).toContain(
      'bg-red-50',
    )
  })
})
