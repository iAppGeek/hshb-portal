import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from './client'
import {
  classes,
  feePlanClasses,
  feePlans,
  studentClasses,
  studentFeeAccounts,
  studentPayments,
} from './schema'
import {
  addStudentPayment,
  deleteStudentPayment,
  getPriorYearBalances,
  getStudentFeeDetail,
  getStudentFeeList,
  getStudentFeeYears,
  upsertStudentFeeAccount,
} from './student-fees'
import { resetDatabase, SEED } from './test-db'

const S = SEED.students
const PRIOR = SEED.years.prior
const CURRENT = SEED.years.current
const OLD_CLASS = '10000000-0000-0000-0000-0000000000c1'

beforeAll(async () => {
  // Last year: Alice and Bob were in "Old Alpha", on a £600 plan.
  await db.insert(classes).values({
    id: OLD_CLASS,
    name: 'Old Alpha',
    yearGroup: 'Year 0',
    academicYearId: PRIOR,
    teacherId: SEED.staff.teacher,
    active: false,
  })
  await db.insert(studentClasses).values([
    {
      studentId: S.alice,
      classId: OLD_CLASS,
      startDate: '2025-09-01',
      endDate: '2026-07-20',
    },
    {
      studentId: S.bob,
      classId: OLD_CLASS,
      startDate: '2025-09-01',
      endDate: '2026-07-20',
    },
  ])
  const [plan] = await db
    .insert(feePlans)
    .values({
      name: 'Prior',
      academicYearId: PRIOR,
      fullYearAmount: 600,
      monthlyInstalmentAmount: 60,
      termlyInstalmentAmount: 200,
    })
    .returning({ id: feePlans.id })
  await db
    .insert(feePlanClasses)
    .values({ feePlanId: plan.id, classId: OLD_CLASS })
  await db.insert(studentFeeAccounts).values([
    { studentId: S.alice, academicYearId: PRIOR, paymentPlan: 'monthly' },
    {
      studentId: S.bob,
      academicYearId: PRIOR,
      paymentPlan: 'monthly',
      settled: true,
    },
  ])
  await db.insert(studentPayments).values([
    {
      studentId: S.alice,
      academicYearId: PRIOR,
      amount: 100,
      paymentDate: '2025-10-01',
      reference: 'P1',
      method: 'cash',
    },
    {
      studentId: S.alice,
      academicYearId: PRIOR,
      amount: 50.25,
      paymentDate: '2025-11-01',
      reference: 'P2',
      method: 'cash',
    },
  ])
})
afterAll(resetDatabase)

describe('student fee list', () => {
  it('lists students with their year’s classes, account and payments', async () => {
    const list = await getStudentFeeList(CURRENT)
    const alice = list.find((s) => s.id === S.alice)
    expect(alice).toMatchObject({
      first_name: 'Alice',
      classes: [{ id: SEED.classes.alpha, name: 'Alpha' }],
      account: { payment_plan: 'monthly', academic_year_id: CURRENT },
      payments: [{ amount: 100, payment_date: '2026-09-01' }],
    })
    expect(list.find((s) => s.id === S.carol)?.account).toBeNull()
  })

  it('uses last year’s classes for a past year', async () => {
    const list = await getStudentFeeList(PRIOR)
    const alice = list.find((s) => s.id === S.alice)
    expect(alice?.classes).toEqual([{ id: OLD_CLASS, name: 'Old Alpha' }])
    expect(alice?.payments).toHaveLength(2)
    expect(alice?.payments).toEqual(
      expect.arrayContaining([
        { amount: 100, payment_date: '2025-10-01' },
        { amount: 50.25, payment_date: '2025-11-01' },
      ]),
    )
  })
})

describe('student fee detail and years', () => {
  it('returns the detail for one student and year, payments newest first', async () => {
    const detail = await getStudentFeeDetail(S.alice, PRIOR)
    expect(detail?.student).toEqual({
      id: S.alice,
      first_name: 'Alice',
      last_name: 'Student',
      student_code: null,
      active: true,
      leaving_reason: null,
    })
    expect(detail?.payments.map((p) => p.reference)).toEqual(['P2', 'P1'])
    expect(detail?.payments[0].recorder).toBeNull()
    expect(
      await getStudentFeeDetail('30000000-0000-0000-0000-0000000000ff', PRIOR),
    ).toBeNull()
    expect(await getStudentFeeDetail('not-a-uuid', PRIOR)).toBeNull()
    expect(await getStudentFeeDetail(S.alice, 'not-a-uuid')).toBeNull()
  })

  it('lists every year the student has something in, newest first', async () => {
    const years = await getStudentFeeYears(S.alice)
    expect(years.map((y) => y.year.code)).toEqual(['2026-27', '2025-26'])
    expect(years[1]).toMatchObject({
      classes: [{ id: OLD_CLASS, name: 'Old Alpha' }],
      account: { payment_plan: 'monthly' },
    })
    expect(await getStudentFeeYears(S.carol)).toHaveLength(1)
    expect(await getStudentFeeYears('not-a-uuid')).toEqual([])
  })
})

describe('getPriorYearBalances', () => {
  it('sums what is still owed from earlier years, skipping settled accounts', async () => {
    // Alice: £600 plan, paid £150.25 → £449.75. Bob's account is settled.
    expect(await getPriorYearBalances(CURRENT)).toEqual({ [S.alice]: 449.75 })
    expect(await getPriorYearBalances(PRIOR)).toEqual({})
    expect(
      await getPriorYearBalances('05000000-0000-4000-8000-0000000000ff'),
    ).toEqual({})
  })
})

describe('writes', () => {
  it('creates, then updates, a student’s account for a year', async () => {
    const created = await upsertStudentFeeAccount(S.carol, CURRENT, {
      payment_plan: 'custom',
      custom_total_amount: 250,
    })
    const updated = await upsertStudentFeeAccount(S.carol, CURRENT, {
      payment_plan: 'custom',
      custom_up_to_date: true,
    })
    expect(updated).toMatchObject({
      id: created.id,
      custom_total_amount: 250,
      custom_up_to_date: true,
    })
  })

  it('adds a payment with its recorder and deletes it only for its student', async () => {
    const payment = await addStudentPayment(S.carol, {
      amount: 25.5,
      payment_date: '2026-09-20',
      reference: 'C1',
      method: 'card',
      notes: null,
      recorded_by: SEED.staff.secretary,
      academic_year_id: CURRENT,
    })
    expect(payment).toMatchObject({
      amount: 25.5,
      recorder: { first_name: 'Sandra', last_name: 'Secretary' },
    })
    expect(await deleteStudentPayment(S.alice, payment.id)).toBe(false)
    expect(await deleteStudentPayment(S.carol, payment.id)).toBe(true)
  })
})
