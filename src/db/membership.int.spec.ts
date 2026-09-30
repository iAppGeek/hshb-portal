import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { isEnrolledOn } from '@/lib/enrolment'

import { db } from './client'
import { enrolledOn, isCurrentStay, staysOverlapping } from './membership'
import { studentClasses } from './schema'
import { resetDatabase, SEED } from './test-db'

// Carol's stays in Gamma: one closed week, one open from a future date.
const STAYS = [
  { startDate: '2026-09-01', endDate: '2026-09-08' },
  { startDate: '2026-10-01', endDate: null },
]
let ids: string[] = []

beforeAll(async () => {
  const rows = await db
    .insert(studentClasses)
    .values(
      STAYS.map((s) => ({
        ...s,
        studentId: SEED.students.carol,
        classId: SEED.classes.gamma,
      })),
    )
    .returning({ id: studentClasses.id })
  ids = rows.map((r) => r.id)
})
afterAll(resetDatabase)

async function matching(
  where: ReturnType<typeof isCurrentStay>,
): Promise<string[]> {
  const rows = await db
    .select({ startDate: studentClasses.startDate })
    .from(studentClasses)
    .where(and(inArray(studentClasses.id, ids), where))
  return rows.map((r) => r.startDate).sort()
}

describe('membership SQL fragments', () => {
  it('isCurrentStay is the open stays, including a future one', async () => {
    expect(await matching(isCurrentStay(studentClasses))).toEqual([
      '2026-10-01',
    ])
  })

  it.each([
    '2026-08-31',
    '2026-09-01',
    '2026-09-07',
    '2026-09-08',
    '2026-10-01',
    '2027-01-01',
  ])('enrolledOn(%s) agrees with isEnrolledOn', async (date) => {
    const expected = STAYS.filter((s) => isEnrolledOn(s, date)).map(
      (s) => s.startDate,
    )
    expect(await matching(enrolledOn(studentClasses, date))).toEqual(expected)
  })

  it('staysOverlapping includes a stay touching the range and excludes one ended by its start', async () => {
    expect(
      await matching(
        staysOverlapping(studentClasses, '2026-09-05', '2026-10-01'),
      ),
    ).toEqual(['2026-09-01', '2026-10-01'])
    expect(
      await matching(
        staysOverlapping(studentClasses, '2026-09-08', '2026-09-30'),
      ),
    ).toEqual([])
  })

  it('works inside a relational `with`', async () => {
    const carol = await db.query.students.findFirst({
      where: (s) => eq(s.id, SEED.students.carol),
      with: {
        studentClasses: { where: isCurrentStay, columns: { classId: true } },
      },
    })
    expect(carol?.studentClasses.map((sc) => sc.classId).sort()).toEqual(
      [SEED.classes.beta, SEED.classes.gamma].sort(),
    )
  })
})
