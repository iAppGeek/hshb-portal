import { afterAll, describe, expect, it } from 'vitest'

import {
  createFeePlan,
  getFeePlanById,
  getFeePlans,
  updateFeePlan,
} from './fee-plans'
import { resetDatabase, SEED } from './test-db'

afterAll(resetDatabase)

describe('fee plans', () => {
  it('lists plans with their year and class ids, amounts as numbers', async () => {
    const [plan] = await getFeePlans(SEED.years.current)
    expect(plan).toMatchObject({
      id: SEED.feePlan,
      name: 'Standard',
      full_year_amount: 800,
      monthly_instalment_amount: 100,
      termly_instalment_amount: 266.67,
      academic_year: {
        id: SEED.years.current,
        code: '2026-27',
        start_date: '2026-09-01',
        end_date: '2027-08-31',
      },
    })
    expect(plan.class_ids.sort()).toEqual(
      [SEED.classes.alpha, SEED.classes.beta].sort(),
    )
    expect(await getFeePlans(SEED.years.prior)).toEqual([])
    expect(await getFeePlans()).toHaveLength(1)
  })

  it('creates and updates a plan through the save_fee_plan RPC', async () => {
    const input = {
      name: 'Gamma plan',
      academic_year_id: SEED.years.current,
      full_year_amount: 500,
      monthly_instalment_amount: 50,
      termly_instalment_amount: 166.67,
      notes: null,
      active: true,
    }
    const { id } = await createFeePlan(input, [SEED.classes.gamma])
    expect(await getFeePlanById(id)).toMatchObject({
      name: 'Gamma plan',
      class_ids: [SEED.classes.gamma],
    })

    await updateFeePlan(id, { ...input, notes: 'Updated', active: false }, [])
    expect(await getFeePlanById(id)).toMatchObject({
      notes: 'Updated',
      active: false,
      class_ids: [],
    })
    expect(
      await getFeePlanById('90000000-0000-0000-0000-0000000000ff'),
    ).toBeNull()
    expect(await getFeePlanById('not-a-uuid')).toBeNull()
  })
})
