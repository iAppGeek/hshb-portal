import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getActor } from '@/auth/require'
import {
  getStaffPayrollByStaffId,
  logAuditEvent,
  upsertStaffPayroll,
} from '@/db'

import { saveStaffPayrollAction } from './actions'

vi.mock('server-only', () => ({}))
vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  getStaffPayrollByStaffId: vi.fn(),
  upsertStaffPayroll: vi.fn(),
  logAuditEvent: vi.fn(),
}))

const ADMIN_ID = 'admin-1'

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

const blank: Record<string, string> = {
  payment_funding: 'school',
  bank_account_name: '',
  bank_sort_code: '',
  bank_account_number: '',
  payroll_ref: '',
  id_type: '',
  id_verified_at: '',
  right_to_work_checked_at: '',
  dbs_level: '',
  dbs_reference: '',
  dbs_issue_date: '',
  dbs_verified_at: '',
  dbs_renewal_due: '',
  first_aid_reference: '',
  first_aid_issue_date: '',
  first_aid_verified_at: '',
  first_aid_expiry_date: '',
  fire_warden_reference: '',
  fire_warden_issue_date: '',
  fire_warden_verified_at: '',
  fire_warden_expiry_date: '',
}

const verifiedId = {
  id_verified: 'on',
  id_type: 'passport',
  id_verified_at: '2026-09-01',
}

const verifiedDbs = {
  dbs_verified: 'on',
  dbs_level: 'enhanced',
  dbs_reference: '001',
  dbs_issue_date: '2026-01-01',
  dbs_verified_at: '2026-01-02',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getActor).mockResolvedValue({
    role: 'admin',
    staffId: ADMIN_ID,
    name: null,
    email: '',
  } as never)
  vi.mocked(getStaffPayrollByStaffId).mockResolvedValue(null)
  vi.mocked(upsertStaffPayroll).mockResolvedValue({ id: 'p1' } as never)
})

describe('saveStaffPayrollAction', () => {
  it('rejects unauthenticated users', async () => {
    vi.mocked(getActor).mockResolvedValue(null as never)
    expect(await saveStaffPayrollAction('s1', makeFormData(blank))).toEqual({
      error: 'Not authenticated',
    })
    expect(upsertStaffPayroll).not.toHaveBeenCalled()
  })

  it.each(['headteacher', 'secretary', 'teacher'])(
    'rejects %s',
    async (role) => {
      vi.mocked(getActor).mockResolvedValue({
        role,
        name: null,
        email: '',
      } as never)
      expect(await saveStaffPayrollAction('s1', makeFormData(blank))).toEqual({
        error: 'Not authorised',
      })
    },
  )

  it('returns the first validation error', async () => {
    const result = await saveStaffPayrollAction(
      's1',
      makeFormData({ ...blank, payment_funding: '' }),
    )
    expect(result).toMatchObject({
      error: 'Select how this staff member is paid',
    })
  })

  it('creates a record, redacts bank details in the audit log and redirects', async () => {
    await expect(
      saveStaffPayrollAction(
        's1',
        makeFormData({
          ...blank,
          bank_account_name: 'Ann Lee',
          bank_sort_code: '12-34-56',
          bank_account_number: '12345678',
          ...verifiedId,
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/hr')

    expect(upsertStaffPayroll).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        bank_sort_code: '123456',
        id_verified: true,
        id_verified_by: ADMIN_ID,
        dbs_verified_by: null,
      }),
    )
    const entry = vi.mocked(logAuditEvent).mock.calls[0][0]
    expect(entry).toMatchObject({
      staffId: ADMIN_ID,
      action: 'create',
      entity: 'staff_payroll',
      entityId: 'p1',
      details: {
        staff_id: 's1',
        bank_sort_code: '[changed]',
        bank_account_number: '[changed]',
        bank_account_name: '[changed]',
      },
    })
    expect(JSON.stringify(entry)).not.toContain('12345678')
    expect(revalidatePath).toHaveBeenCalledWith('/hr')
    expect(redirect).toHaveBeenCalledWith('/hr')
  })

  it('keeps the original verifiers when checks stay verified', async () => {
    vi.mocked(getStaffPayrollByStaffId).mockResolvedValue({
      id: 'p1',
      id_verified: true,
      id_verified_by: 'original',
      dbs_verified: true,
      dbs_verified_by: 'dbs-original',
    } as never)

    await expect(
      saveStaffPayrollAction(
        's1',
        makeFormData({ ...blank, ...verifiedId, ...verifiedDbs }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(upsertStaffPayroll).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        id_verified_by: 'original',
        dbs_verified_by: 'dbs-original',
        dbs_renewal_due: '2029-01-01',
      }),
    )
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update' }),
    )
  })

  it('attributes a newly verified DBS to the current admin', async () => {
    vi.mocked(getStaffPayrollByStaffId).mockResolvedValue({
      id: 'p1',
      id_verified: false,
      id_verified_by: null,
      dbs_verified: false,
      dbs_verified_by: 'stale',
    } as never)

    await expect(
      saveStaffPayrollAction('s1', makeFormData({ ...blank, ...verifiedDbs })),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(upsertStaffPayroll).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        id_verified_by: null,
        dbs_verified_by: ADMIN_ID,
      }),
    )
  })

  it('returns a friendly error when saving fails', async () => {
    vi.mocked(upsertStaffPayroll).mockRejectedValue(new Error('down'))
    expect(await saveStaffPayrollAction('s1', makeFormData(blank))).toEqual({
      error: 'Failed to save the payroll record. Please try again.',
    })
    expect(redirect).not.toHaveBeenCalled()
  })
})
