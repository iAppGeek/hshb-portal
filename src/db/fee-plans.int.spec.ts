import { count, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { DbError } from '@/lib/db-error'

import { db } from './client'
import {
  createFeePlan,
  getFeePlanById,
  getFeePlans,
  updateFeePlan,
} from './fee-plans'
import { classes, feePlanClasses, feePlans } from './schema'
import { failWritesTo, resetDatabase, SEED } from './test-db'

const INPUT = {
  name: 'Gamma plan',
  academic_year_id: SEED.years.current,
  full_year_amount: 500,
  monthly_instalment_amount: 50,
  termly_instalment_amount: 166.67,
  notes: null,
  active: true,
}

async function planCount(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(feePlans)
  return n
}

async function linkCount(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(feePlanClasses)
  return n
}

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

  it('creates and updates a plan with its classes', async () => {
    const { id } = await createFeePlan(INPUT, [SEED.classes.gamma])
    expect(await getFeePlanById(id)).toMatchObject({
      name: 'Gamma plan',
      class_ids: [SEED.classes.gamma],
    })

    await updateFeePlan(id, { ...INPUT, notes: 'Updated', active: false }, [])
    expect(await getFeePlanById(id)).toMatchObject({
      notes: 'Updated',
      active: false,
      class_ids: [],
    })
    expect(
      await getFeePlanById('90000000-0000-0000-0000-0000000000ff'),
    ).toBeNull()
    expect(await getFeePlanById('not-a-uuid')).toBeNull()

    await db.delete(feePlans).where(eq(feePlans.id, id))
  })
})

describe('saving a fee plan that breaks a rule', () => {
  it('rejects an update to a missing plan', async () => {
    await expect(
      updateFeePlan('90000000-0000-0000-0000-0000000000ff', INPUT, []),
    ).rejects.toEqual(new DbError('Fee plan not found.'))
  })

  it('rejects a class from another academic year, saving nothing', async () => {
    const [prior] = await db
      .insert(classes)
      .values({
        name: 'Old',
        yearGroup: 'Year 1',
        academicYearId: SEED.years.prior,
      })
      .returning({ id: classes.id })
    const plans = await planCount()

    await expect(createFeePlan(INPUT, [prior.id])).rejects.toEqual(
      new DbError(
        "One or more selected classes do not belong to this fee plan's academic year.",
      ),
    )
    expect(await planCount()).toBe(plans)

    // An update keeps the plan's old classes too.
    await expect(
      updateFeePlan(SEED.feePlan, { ...INPUT, name: 'Standard' }, [
        SEED.classes.alpha,
        prior.id,
      ]),
    ).rejects.toThrow(DbError)
    expect((await getFeePlanById(SEED.feePlan))?.class_ids.sort()).toEqual(
      [SEED.classes.alpha, SEED.classes.beta].sort(),
    )
    await db.delete(classes).where(eq(classes.id, prior.id))
  })

  it('rejects a duplicate name, or a class already on another plan', async () => {
    const message =
      'A fee plan with this name already exists for this academic year, or a selected class is already on another plan.'
    await expect(
      createFeePlan({ ...INPUT, name: 'Standard' }, []),
    ).rejects.toEqual(new DbError(message))
    await expect(createFeePlan(INPUT, [SEED.classes.alpha])).rejects.toEqual(
      new DbError(message),
    )
  })

  it('rejects a class that no longer exists', async () => {
    const [gone] = await db
      .insert(classes)
      .values({
        name: 'Gone',
        yearGroup: 'Year 1',
        academicYearId: SEED.years.current,
      })
      .returning({ id: classes.id })
    await db.delete(classes).where(eq(classes.id, gone.id))

    // The year check finds no such class; the link's foreign key does.
    await expect(createFeePlan(INPUT, [gone.id])).rejects.toEqual(
      new DbError('One of the selected classes no longer exists.'),
    )
  })

  it('leaves nothing behind when a write fails part-way', async () => {
    const plans = await planCount()
    const links = await linkCount()

    const created = await failWritesTo(
      'fee_plan_classes',
      `class_id <> '${SEED.classes.gamma}'`,
      () => createFeePlan(INPUT, [SEED.classes.gamma]),
    )
    expect(created).toBeDefined()
    expect(await planCount()).toBe(plans)

    // The update's delete of the old links ran before the insert failed.
    const updated = await failWritesTo(
      'fee_plan_classes',
      `class_id <> '${SEED.classes.gamma}'`,
      () =>
        updateFeePlan(SEED.feePlan, { ...INPUT, name: 'Renamed' }, [
          SEED.classes.gamma,
        ]),
    )
    expect(updated).toBeDefined()
    expect(await getFeePlanById(SEED.feePlan)).toMatchObject({
      name: 'Standard',
    })
    expect(await linkCount()).toBe(links)
  })
})
