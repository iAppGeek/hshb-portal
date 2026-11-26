import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { asDbError } from '@/lib/db-error'

import { db } from './client'
import { staffPayroll } from './schema'
import {
  getStaffPayrollByStaffId,
  getStaffPayrollList,
  upsertStaffPayroll,
} from './staff-payroll'
import { SEED } from './test-db'

afterAll(async () => {
  await db
    .delete(staffPayroll)
    .where(eq(staffPayroll.staffId, SEED.staff.secretary))
})

describe('staff payroll', () => {
  it('lists every member with their payroll record, or null', async () => {
    const list = await getStaffPayrollList()
    expect(list).toHaveLength(5)
    const tom = list.find((s) => s.id === SEED.staff.teacher)
    expect(tom).toMatchObject({
      title: 'Ms',
      first_name: 'Tom',
      last_name: 'Teacher',
      role: 'teacher',
      payroll: {
        staff_id: SEED.staff.teacher,
        payment_funding: 'school',
        payroll_ref: 'PR-002',
        job_role: 'teacher',
        date_of_birth: '1985-04-12',
        id_verified: false,
        dbs_level: null,
      },
    })
    expect(list.find((s) => s.id === SEED.staff.admin)?.payroll).toBeNull()
  })

  it('creates a record, then updates it in place', async () => {
    const created = await upsertStaffPayroll(SEED.staff.secretary, {
      payment_funding: 'kea',
      bank_sort_code: '112233',
      bank_account_number: '12345678',
    })
    expect(created).toMatchObject({
      staff_id: SEED.staff.secretary,
      payment_funding: 'kea',
      bank_sort_code: '112233',
      first_aid_certified: false,
    })

    const updated = await upsertStaffPayroll(SEED.staff.secretary, {
      payment_funding: 'school',
      id_verified: true,
      id_verified_at: '2026-09-10',
      id_type: 'passport',
    })
    expect(updated.id).toBe(created.id)
    expect(await getStaffPayrollByStaffId(SEED.staff.secretary)).toMatchObject({
      payment_funding: 'school',
      bank_sort_code: '112233',
      id_verified: true,
      id_type: 'passport',
    })
    expect(await getStaffPayrollByStaffId(SEED.staff.admin)).toBeNull()
  })

  it('enforces the CHECK constraints', async () => {
    const err = await upsertStaffPayroll(SEED.staff.secretary, {
      payment_funding: 'school',
      bank_sort_code: '12-34-56',
    }).catch((e: unknown) => e)
    expect(asDbError(err)).toMatchObject({
      code: '23514',
      constraint: 'staff_payroll_bank_sort_code_check',
    })
  })

  it('stores the NI number and home address', async () => {
    await upsertStaffPayroll(SEED.staff.secretary, {
      payment_funding: 'school',
      national_insurance_number: 'QQ123456C',
      address_line_1: '1 High Street',
      address_line_2: null,
      city: 'London',
      postcode: 'N1 1AA',
    })
    expect(await getStaffPayrollByStaffId(SEED.staff.secretary)).toMatchObject({
      national_insurance_number: 'QQ123456C',
      address_line_1: '1 High Street',
      address_line_2: null,
      city: 'London',
      postcode: 'N1 1AA',
    })
  })

  it('rejects a partial address', async () => {
    const err = await upsertStaffPayroll(SEED.staff.secretary, {
      payment_funding: 'school',
      address_line_1: '1 High Street',
      city: null,
      postcode: null,
    }).catch((e: unknown) => e)
    expect(asDbError(err)).toMatchObject({
      code: '23514',
      constraint: 'staff_payroll_address_details_check',
    })
  })

  it('stores the role, date of birth and Update Service number, defaulting the role', async () => {
    await db
      .delete(staffPayroll)
      .where(eq(staffPayroll.staffId, SEED.staff.secretary))
    const created = await upsertStaffPayroll(SEED.staff.secretary, {
      payment_funding: 'volunteer',
    })
    expect(created).toMatchObject({
      job_role: 'admin_assistant',
      date_of_birth: null,
      payroll_ref: null,
    })

    expect(
      await upsertStaffPayroll(SEED.staff.secretary, {
        payment_funding: 'volunteer',
        job_role: 'committee',
        date_of_birth: '1970-01-31',
        dbs_update_service: true,
        dbs_update_service_number: 'C0001',
        dbs_renewal_due: '2027-03-01',
      }),
    ).toMatchObject({
      job_role: 'committee',
      date_of_birth: '1970-01-31',
      dbs_update_service_number: 'C0001',
      dbs_renewal_due: '2027-03-01',
    })
  })

  it.each([
    [{ job_role: 'headteacher' }, 'staff_payroll_job_role_check'],
    [{ dbs_level: 'standard' }, 'staff_payroll_dbs_level_check'],
    [{ payment_funding: 'grant' }, 'staff_payroll_payment_funding_check'],
  ])('rejects %o', async (values, constraint) => {
    const err = await upsertStaffPayroll(SEED.staff.secretary, {
      payment_funding: 'school',
      ...values,
    }).catch((e: unknown) => e)
    expect(asDbError(err)).toMatchObject({ code: '23514', constraint })
  })
})
