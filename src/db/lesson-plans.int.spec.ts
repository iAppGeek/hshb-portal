import { afterAll, describe, expect, it } from 'vitest'

import { asDbError } from '@/lib/db-error'

import {
  createLessonPlan,
  getLessonPlanById,
  getLessonPlanCount,
  getLessonPlanCountByDate,
  getLessonPlans,
  updateLessonPlan,
} from './lesson-plans'
import { resetDatabase, SEED } from './test-db'

afterAll(resetDatabase)

describe('lesson plans', () => {
  it('counts plans overall and for a date', async () => {
    expect(await getLessonPlanCount()).toBe(1)
    const seeded = await getLessonPlanById(SEED.lessonPlan)
    expect(await getLessonPlanCountByDate(seeded!.lesson_date)).toBe(1)
    expect(await getLessonPlanCountByDate('2000-01-01')).toBe(0)
  })

  it('creates, updates and reads a plan with its class and people', async () => {
    const created = await createLessonPlan({
      class_id: SEED.classes.beta,
      lesson_date: '2026-10-05',
      description: 'Fractions',
      created_by: SEED.staff.teacher2,
    })
    expect(created).toMatchObject({
      class: { id: SEED.classes.beta, name: 'Beta', year_group: 'Year 2' },
      creator: { first_name: 'Sarah' },
      updater: null,
    })

    const updated = await updateLessonPlan(created.id, {
      description: 'Decimals',
      updated_by: SEED.staff.admin,
    })
    expect(updated).toMatchObject({
      description: 'Decimals',
      updater: { first_name: 'Alice' },
    })
    expect(await getLessonPlanById(created.id)).toEqual(updated)
    expect(
      await getLessonPlanById('70000000-0000-0000-0000-0000000000ff'),
    ).toBeNull()
  })

  it('lists newest first, filtered by class and paged', async () => {
    const all = await getLessonPlans()
    expect(all.map((p) => p.lesson_date)).toEqual(
      [...all.map((p) => p.lesson_date)].sort().reverse(),
    )
    expect(
      (await getLessonPlans({ classIds: [SEED.classes.beta] })).map(
        (p) => p.description,
      ),
    ).toEqual(['Decimals'])
    expect(await getLessonPlans({ limit: 1, offset: 5 })).toEqual([])
    expect(
      (await getLessonPlans({ classId: SEED.classes.alpha })).map((p) => p.id),
    ).toEqual([SEED.lessonPlan])
    expect(
      await getLessonPlans({
        classId: SEED.classes.alpha,
        classIds: [SEED.classes.beta],
      }),
    ).toEqual([])
  })

  it('rejects a second plan for the same class and date', async () => {
    const err = await createLessonPlan({
      class_id: SEED.classes.beta,
      lesson_date: '2026-10-05',
      description: 'Again',
      created_by: SEED.staff.teacher2,
    }).catch((e: unknown) => e)
    expect(asDbError(err)?.code).toBe('23505')
  })

  it('throws when updating a missing plan', async () => {
    await expect(
      updateLessonPlan('70000000-0000-0000-0000-0000000000ff', {
        updated_by: SEED.staff.admin,
      }),
    ).rejects.toThrow('Lesson plan not found')
  })
})
