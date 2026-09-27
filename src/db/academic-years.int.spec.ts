import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { asDbError } from '@/lib/db-error'

import {
  createAcademicYear,
  getAcademicYearById,
  getAcademicYearForDate,
  getAcademicYears,
  getCurrentAcademicYear,
  updateAcademicYear,
} from './academic-years'
import { db } from './client'
import { academicYears } from './schema'

const CURRENT_YEAR = '05000000-0000-4000-8000-000000000001'
const PRIOR_YEAR = '05000000-0000-4000-8000-000000000002'
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$/

// Two statements so the one-current partial unique index is never violated.
async function makeCurrent(id: string): Promise<void> {
  await db
    .update(academicYears)
    .set({ isCurrent: false })
    .where(eq(academicYears.isCurrent, true))
  await db
    .update(academicYears)
    .set({ isCurrent: true })
    .where(eq(academicYears.id, id))
}

afterAll(async () => {
  await makeCurrent(CURRENT_YEAR)
  await db.delete(academicYears).where(eq(academicYears.code, '2027-28'))
})

describe('getAcademicYears', () => {
  it('returns every year, newest first, in the snake_case row shape', async () => {
    const years = await getAcademicYears()
    expect(years.map((y) => y.code)).toEqual(['2026-27', '2025-26'])
    expect(years[0]).toStrictEqual({
      id: CURRENT_YEAR,
      code: '2026-27',
      start_date: '2026-09-01',
      end_date: '2027-08-31',
      is_current: true,
      created_at: expect.stringMatching(ISO_TIMESTAMP),
      updated_at: expect.stringMatching(ISO_TIMESTAMP),
    })
  })
})

describe('lookups', () => {
  it('finds the current year', async () => {
    expect((await getCurrentAcademicYear()).id).toBe(CURRENT_YEAR)
  })

  it('finds a year by id, or null', async () => {
    expect((await getAcademicYearById(PRIOR_YEAR))?.code).toBe('2025-26')
    expect(
      await getAcademicYearById('05000000-0000-4000-8000-0000000000ff'),
    ).toBeNull()
  })

  it('finds the year containing a date, or null', async () => {
    expect((await getAcademicYearForDate('2026-01-15'))?.id).toBe(PRIOR_YEAR)
    expect(await getAcademicYearForDate('2020-01-01')).toBeNull()
  })

  it('throws when no year is current', async () => {
    await db
      .update(academicYears)
      .set({ isCurrent: false })
      .where(eq(academicYears.isCurrent, true))
    await expect(getCurrentAcademicYear()).rejects.toThrow(
      'No current academic year is set',
    )
    await makeCurrent(CURRENT_YEAR)
  })
})

describe('writes', () => {
  it('creates and updates a year', async () => {
    const { id } = await createAcademicYear({
      code: '2027-28',
      start_date: '2027-09-01',
      end_date: '2028-08-31',
    })
    await updateAcademicYear(id, {
      start_date: '2027-09-02',
      end_date: '2028-07-31',
    })

    expect(await getAcademicYearById(id)).toMatchObject({
      code: '2027-28',
      start_date: '2027-09-02',
      end_date: '2028-07-31',
      is_current: false,
    })
  })

  it('rejects a duplicate code with a unique violation', async () => {
    const err = await createAcademicYear({
      code: '2026-27',
      start_date: '2030-09-01',
      end_date: '2031-08-31',
    }).catch((e: unknown) => e)
    expect(asDbError(err)?.code).toBe('23505')
  })

  it('rejects an overlapping year (EXCLUDE constraint still enforced)', async () => {
    const err = await createAcademicYear({
      code: '2099-00',
      start_date: '2026-10-01',
      end_date: '2027-01-31',
    }).catch((e: unknown) => e)
    expect(asDbError(err)?.code).toBe('23P01')
  })
})
