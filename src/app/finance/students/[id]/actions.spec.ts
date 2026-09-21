import { describe, it, expect, vi, beforeEach } from 'vitest'

import { getActor } from '@/auth/require'
import {
  addStudentPayment,
  deleteStudentPayment,
  logAuditEvent,
  upsertStudentFeeAccount,
} from '@/db'

import {
  addStudentPaymentAction,
  deleteStudentPaymentAction,
  saveStudentFeeAccountAction,
} from './actions'

vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('@/db', () => ({
  upsertStudentFeeAccount: vi.fn(),
  addStudentPayment: vi.fn(),
  deleteStudentPayment: vi.fn(),
  logAuditEvent: vi.fn(),
}))

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

const YEAR_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

const account = {
  academic_year_id: YEAR_ID,
  payment_plan: 'termly',
  payment_plan_notes: '',
  fee_plan_override_id: '',
  custom_total_amount: '',
  settled: '',
  settled_note: '',
}

const payment = {
  amount: '100.50',
  payment_date: '2025-09-01',
  academic_year_id: YEAR_ID,
  reference: 'REF-1',
  method: 'bank_transfer',
  notes: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getActor).mockResolvedValue({
    role: 'admin',
    staffId: 'admin-1',
    name: null,
    email: '',
  } as never)
})

describe.each([
  [
    'saveStudentFeeAccountAction',
    () => saveStudentFeeAccountAction('s1', makeFormData(account)),
  ],
  [
    'addStudentPaymentAction',
    () => addStudentPaymentAction('s1', makeFormData(payment)),
  ],
  [
    'deleteStudentPaymentAction',
    () => deleteStudentPaymentAction('s1', 'pay1'),
  ],
])('%s access', (_name, run) => {
  it('rejects unauthenticated users', async () => {
    vi.mocked(getActor).mockResolvedValue(null as never)
    expect(await run()).toEqual({ error: 'Not authenticated' })
  })

  it('rejects non-admins', async () => {
    vi.mocked(getActor).mockResolvedValue({
      role: 'headteacher',
      staffId: 'h1',
      name: null,
      email: '',
    } as never)
    expect(await run()).toEqual({ error: 'Not authorised' })
    expect(upsertStudentFeeAccount).not.toHaveBeenCalled()
    expect(addStudentPayment).not.toHaveBeenCalled()
    expect(deleteStudentPayment).not.toHaveBeenCalled()
  })
})

describe('saveStudentFeeAccountAction', () => {
  it('saves the account and logs it', async () => {
    expect(
      await saveStudentFeeAccountAction('s1', makeFormData(account)),
    ).toBeUndefined()

    expect(upsertStudentFeeAccount).toHaveBeenCalledWith('s1', YEAR_ID, {
      payment_plan: 'termly',
      payment_plan_notes: null,
      fee_plan_override_id: null,
      custom_total_amount: null,
      custom_up_to_date: false,
      settled: false,
      settled_note: null,
    })
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 'admin-1',
        action: 'update',
        entity: 'student_fee_account',
        entityId: 's1',
      }),
    )
  })

  it('returns validation errors', async () => {
    expect(
      await saveStudentFeeAccountAction(
        's1',
        makeFormData({ ...account, payment_plan: 'custom' }),
      ),
    ).toMatchObject({ error: 'Enter the agreed total for a custom plan' })
  })

  it('returns a friendly error when saving fails', async () => {
    vi.mocked(upsertStudentFeeAccount).mockRejectedValue(new Error('down'))
    expect(
      await saveStudentFeeAccountAction('s1', makeFormData(account)),
    ).toEqual({ error: 'Failed to save the fee account. Please try again.' })
  })
})

describe('addStudentPaymentAction', () => {
  it('records the payment against the current admin', async () => {
    vi.mocked(addStudentPayment).mockResolvedValue({ id: 'pay1' })

    expect(await addStudentPaymentAction('s1', makeFormData(payment))).toEqual({
      data: { id: 'pay1' },
    })

    expect(addStudentPayment).toHaveBeenCalledWith('s1', {
      amount: 100.5,
      payment_date: '2025-09-01',
      academic_year_id: YEAR_ID,
      reference: 'REF-1',
      method: 'bank_transfer',
      notes: null,
      recorded_by: 'admin-1',
    })
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        entity: 'student_payment',
        entityId: 'pay1',
        details: expect.objectContaining({ student_id: 's1', amount: 100.5 }),
      }),
    )
  })

  it('returns validation errors', async () => {
    expect(
      await addStudentPaymentAction(
        's1',
        makeFormData({ ...payment, reference: '' }),
      ),
    ).toMatchObject({ error: 'Required' })
    expect(addStudentPayment).not.toHaveBeenCalled()
  })

  it('returns a friendly error when saving fails', async () => {
    vi.mocked(addStudentPayment).mockRejectedValue(new Error('down'))
    expect(await addStudentPaymentAction('s1', makeFormData(payment))).toEqual({
      error: 'Failed to record the payment. Please try again.',
    })
  })
})

describe('deleteStudentPaymentAction', () => {
  it('deletes the payment and logs it', async () => {
    vi.mocked(deleteStudentPayment).mockResolvedValue(true)

    expect(await deleteStudentPaymentAction('s1', 'pay1')).toBeUndefined()

    expect(deleteStudentPayment).toHaveBeenCalledWith('s1', 'pay1')
    expect(logAuditEvent).toHaveBeenCalledWith({
      staffId: 'admin-1',
      action: 'delete',
      entity: 'student_payment',
      entityId: 'pay1',
      details: { student_id: 's1' },
    })
  })

  it('reports a payment that no longer exists', async () => {
    vi.mocked(deleteStudentPayment).mockResolvedValue(false)
    expect(await deleteStudentPaymentAction('s1', 'pay1')).toEqual({
      error: 'That payment no longer exists.',
    })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('returns a friendly error when deleting fails', async () => {
    vi.mocked(deleteStudentPayment).mockRejectedValue(new Error('down'))
    expect(await deleteStudentPaymentAction('s1', 'pay1')).toEqual({
      error: 'Failed to delete the payment. Please try again.',
    })
  })
})
