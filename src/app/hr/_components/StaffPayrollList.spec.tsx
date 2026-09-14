import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { getStaffPayrollList, type StaffPayrollRow } from '@/db'

import StaffPayrollList from './StaffPayrollList'

vi.mock('@/db', () => ({ getStaffPayrollList: vi.fn() }))
vi.mock('@/lib/datetime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/datetime')>()),
  todayInSchoolTz: () => '2026-09-13',
}))

function makePayroll(overrides: Partial<StaffPayrollRow>): StaffPayrollRow {
  return {
    id: 'p1',
    staff_id: 's1',
    payment_funding: 'school',
    bank_account_name: null,
    bank_sort_code: null,
    bank_account_number: null,
    payroll_ref: null,
    id_verified: false,
    id_verified_at: null,
    id_type: null,
    id_verified_by: null,
    right_to_work_checked: false,
    right_to_work_checked_at: null,
    dbs_verified: false,
    dbs_level: null,
    dbs_barred_list_checked: false,
    dbs_update_service: false,
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

const base = { role: 'teacher', title: 'Ms' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StaffPayrollList', () => {
  it('shows an empty state with no staff', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([])
    render(await StaffPayrollList())
    expect(screen.getByText('No staff found.')).toBeTruthy()
  })

  it('shows staff without a record and links to add one', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      { ...base, id: 's1', first_name: 'Ann', last_name: 'Lee', payroll: null },
    ])
    render(await StaffPayrollList())

    const row = within(screen.getByTestId('payroll-row-s1'))
    expect(row.getByText('Ms Ann Lee')).toBeTruthy()
    expect(row.getByText('No record')).toBeTruthy()
    expect(
      row.getByRole('link', { name: 'Add record' }).getAttribute('href'),
    ).toBe('/hr/staff/s1')
  })

  it('shows funding, masked bank details and compliance ticks', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      {
        ...base,
        id: 's1',
        first_name: 'Ann',
        last_name: 'Lee',
        payroll: makePayroll({
          payment_funding: 'kea',
          bank_account_number: '12345678',
          id_verified: true,
          dbs_verified: true,
          dbs_renewal_due: '2028-09-01',
        }),
      },
    ])
    render(await StaffPayrollList())

    const rowEl = screen.getByTestId('payroll-row-s1')
    const row = within(rowEl)
    expect(row.getByText('KEA')).toBeTruthy()
    expect(row.getByText('••••5678')).toBeTruthy()
    expect(rowEl.textContent).not.toContain('12345678')
    expect(row.getByText('✓ ID')).toBeTruthy()
    expect(row.getByText('✗ Right to work')).toBeTruthy()
    expect(row.getByText('Renew by 1 Sept 2028')).toBeTruthy()
    expect(row.getByRole('link', { name: 'Edit' })).toBeTruthy()
    expect(rowEl.className).not.toContain('bg-red-50')
  })

  it('highlights lapsed DBS and flags expiring certificates', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      {
        ...base,
        id: 's1',
        first_name: 'Ann',
        last_name: 'Lee',
        payroll: makePayroll({
          dbs_verified: true,
          dbs_renewal_due: '2026-09-01',
          first_aid_certified: true,
          first_aid_expiry_date: '2026-10-01',
          fire_warden_certified: true,
        }),
      },
    ])
    render(await StaffPayrollList())

    const rowEl = screen.getByTestId('payroll-row-s1')
    const row = within(rowEl)
    expect(rowEl.className).toContain('bg-red-50')
    expect(
      row.getByText('Renewal overdue since 1 Sept 2026').className,
    ).toContain('text-red-700')
    expect(row.getByText('Expires 1 Oct 2026').className).toContain(
      'text-amber-700',
    )
    expect(row.getByText('✓ Held')).toBeTruthy()
  })

  it('highlights an expired fire warden certificate', async () => {
    vi.mocked(getStaffPayrollList).mockResolvedValue([
      {
        ...base,
        id: 's1',
        first_name: 'Ann',
        last_name: 'Lee',
        payroll: makePayroll({
          fire_warden_certified: true,
          fire_warden_expiry_date: '2025-01-01',
        }),
      },
    ])
    render(await StaffPayrollList())

    expect(screen.getByTestId('payroll-row-s1').className).toContain(
      'bg-red-50',
    )
    expect(screen.getByText('Expired 1 Jan 2025')).toBeTruthy()
    expect(screen.getAllByText('Not recorded')).toHaveLength(2)
  })
})
