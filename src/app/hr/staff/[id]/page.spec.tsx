import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import {
  getAcademicYears,
  getAllStaff,
  getStaffById,
  getStaffPayrollByStaffId,
} from '@/db'

import StaffPayrollPage from './page'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock('@/db', () => ({
  getStaffById: vi.fn(),
  getStaffPayrollByStaffId: vi.fn(),
  getAllStaff: vi.fn(),
  getAcademicYears: vi.fn(),
}))
vi.mock('@/lib/datetime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/datetime')>()),
  todayInSchoolTz: () => '2026-11-26',
}))
vi.mock('./actions', () => ({ saveStaffPayrollAction: vi.fn() }))
vi.mock('./StaffPayrollForm', () => ({
  default: (props: {
    payroll: unknown
    idVerifiedByName: string | null
    dbsVerifiedByName: string | null
    action: unknown
  }) => (
    <div data-testid="form">
      {props.payroll ? 'has-record' : 'no-record'}|
      {props.idVerifiedByName ?? '-'}|{props.dbsVerifiedByName ?? '-'}|
      {typeof props.action}
    </div>
  ),
}))

const params = Promise.resolve({ id: 's1' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({
    user: { role: 'admin', staffId: 'staff-1' },
  } as never)
  vi.mocked(getStaffById).mockResolvedValue({
    id: 's1',
    title: 'Dr',
    first_name: 'Ann',
    last_name: 'Lee',
  } as never)
  vi.mocked(getAllStaff).mockResolvedValue([
    { id: 'a1', first_name: 'Ada', last_name: 'Admin' },
  ] as never)
  vi.mocked(getStaffPayrollByStaffId).mockResolvedValue(null)
  vi.mocked(getAcademicYears).mockResolvedValue([
    { start_date: '2026-09-01', end_date: '2027-08-31', is_current: true },
  ] as never)
})

describe('StaffPayrollPage', () => {
  it.each(['teacher', 'headteacher', 'secretary'])(
    'redirects %s to the dashboard',
    async (role) => {
      vi.mocked(auth).mockResolvedValue({
        user: { role, staffId: 'staff-1' },
      } as never)
      await expect(StaffPayrollPage({ params })).rejects.toThrow(
        'NEXT_REDIRECT:/dashboard',
      )
    },
  )

  it('shows not found when the staff member is missing', async () => {
    vi.mocked(getStaffById).mockResolvedValue(null)
    await expect(StaffPayrollPage({ params })).rejects.toThrow(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    )
    expect(redirect).not.toHaveBeenCalled()
  })

  it('renders the title and an empty form without a record', async () => {
    render(await StaffPayrollPage({ params }))

    expect(screen.getByRole('heading', { name: 'Dr Ann Lee' })).toBeTruthy()
    expect(
      screen.getByText(/Role, date of birth and payment funding are required/),
    ).toBeTruthy()
    expect(screen.getByTestId('form').textContent).toBe(
      'no-record|-|-|function',
    )
    expect(screen.queryByRole('region', { name: 'HR status' })).toBeNull()
  })

  it('lists the open issues above the form', async () => {
    vi.mocked(getStaffPayrollByStaffId).mockResolvedValue({
      id: 'p1',
      job_role: 'admin_assistant',
      payment_funding: 'volunteer',
      address_line_1: '1 High Street',
      id_verified: false,
      right_to_work_checked: false,
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
      id_verified_by: null,
      dbs_verified_by: null,
    } as never)

    render(await StaffPayrollPage({ params }))

    const panel = screen.getByRole('region', { name: 'HR status' })
    expect(panel).toHaveTextContent('Action needed: 1 open issue')
    expect(panel).toHaveTextContent('ID has not been verified')
  })

  it('passes verifier names for an existing record', async () => {
    vi.mocked(getStaffPayrollByStaffId).mockResolvedValue({
      id: 'p1',
      id_verified_by: 'a1',
      dbs_verified_by: 'gone',
    } as never)

    render(await StaffPayrollPage({ params }))

    expect(screen.getByText('Payroll and compliance record.')).toBeTruthy()
    expect(screen.getByTestId('form').textContent).toBe(
      'has-record|Ada Admin|-|function',
    )
  })
})
