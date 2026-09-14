import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getAllStaff, getStaffById, getStaffPayrollByStaffId } from '@/db'

import StaffPayrollPage from './page'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock('@/db', () => ({
  getStaffById: vi.fn(),
  getStaffPayrollByStaffId: vi.fn(),
  getAllStaff: vi.fn(),
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
  vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as never)
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
})

describe('StaffPayrollPage', () => {
  it.each(['teacher', 'headteacher', 'secretary'])(
    'redirects %s to the dashboard',
    async (role) => {
      vi.mocked(auth).mockResolvedValue({ user: { role } } as never)
      await expect(StaffPayrollPage({ params })).rejects.toThrow(
        'NEXT_REDIRECT:/dashboard',
      )
    },
  )

  it('redirects to the staff tab when the staff member is missing', async () => {
    vi.mocked(getStaffById).mockResolvedValue(null)
    await expect(StaffPayrollPage({ params })).rejects.toThrow(
      'NEXT_REDIRECT:/hr',
    )
    expect(redirect).toHaveBeenCalledTimes(1)
  })

  it('renders the title and an empty form without a record', async () => {
    render(await StaffPayrollPage({ params }))

    expect(screen.getByRole('heading', { name: 'Dr Ann Lee' })).toBeTruthy()
    expect(screen.getByText(/Payment funding is required/)).toBeTruthy()
    expect(screen.getByTestId('form').textContent).toBe(
      'no-record|-|-|function',
    )
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
