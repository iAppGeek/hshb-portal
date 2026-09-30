import 'server-only'

import { and, asc, count, eq, inArray, ne } from 'drizzle-orm'

import { asDbError, DbError } from '@/lib/db-error'
import { isUuid } from '@/lib/uuid'

import { toCamel, toSnake, type Snake } from './casing'
import { db } from './client'
import { classes, feePlanClasses, feePlans, type FeePlan } from './schema'

export type FeePlanRow = Snake<FeePlan>

export type FeePlanAcademicYear = {
  id: string
  code: string
  start_date: string
  end_date: string
}

export type FeePlanWithClasses = Omit<FeePlanRow, 'academic_year_id'> & {
  academic_year: FeePlanAcademicYear
  class_ids: string[]
}

export type FeePlanInput = {
  name: string
  academic_year_id: string
  full_year_amount: number
  monthly_instalment_amount: number
  termly_instalment_amount: number
  notes: string | null
  active: boolean
}

const feePlanWith = {
  academicYear: {
    columns: { id: true, code: true, startDate: true, endDate: true },
  },
  feePlanClasses: { columns: { classId: true } },
} as const

/** A plan row with its year and the ids of the classes it covers. */
function withClassIds<T extends { feePlanClasses: { classId: string }[] }>(
  plan: T,
): Omit<T, 'feePlanClasses'> & { classIds: string[] } {
  const { feePlanClasses, ...rest } = plan
  return { ...rest, classIds: feePlanClasses.map((link) => link.classId) }
}

/** All plans when `yearId` is omitted (e.g. for the override select's
 * "other years" guard, and for computing prior-year balances). */
export async function getFeePlans(
  yearId?: string,
): Promise<FeePlanWithClasses[]> {
  const rows = await db.query.feePlans.findMany({
    with: feePlanWith,
    where: yearId ? eq(feePlans.academicYearId, yearId) : undefined,
    orderBy: asc(feePlans.name),
  })
  return toSnake(rows.map(withClassIds))
}

export async function getFeePlanById(
  id: string,
): Promise<FeePlanWithClasses | null> {
  // A malformed id finds nothing, rather than failing the uuid cast.
  if (!isUuid(id)) return null

  const row = await db.query.feePlans.findFirst({
    with: feePlanWith,
    where: eq(feePlans.id, id),
  })
  return row ? toSnake(withClassIds(row)) : null
}

/** The rules a save breaks, raised as constraint errors by the insert/update. */
function feePlanError(err: unknown): unknown {
  switch (asDbError(err)?.code) {
    case '23505':
      return new DbError(
        'A fee plan with this name already exists for this academic year, or a selected class is already on another plan.',
      )
    case '23503':
      return new DbError('One of the selected classes no longer exists.')
    default:
      return err
  }
}

// The plan and its class links are written in one transaction, so a rejected
// link never leaves a half-saved plan.
async function saveFeePlan(
  id: string | null,
  input: FeePlanInput,
  classIds: string[],
): Promise<string> {
  const values = toCamel(input)
  try {
    return await db.transaction(async (tx) => {
      let planId: string
      if (id === null) {
        const [created] = await tx
          .insert(feePlans)
          .values(values)
          .returning({ id: feePlans.id })
        planId = created.id
      } else {
        const [updated] = await tx
          .update(feePlans)
          .set(values)
          .where(eq(feePlans.id, id))
          .returning({ id: feePlans.id })
        if (!updated) throw new DbError('Fee plan not found.')
        planId = updated.id
        await tx
          .delete(feePlanClasses)
          .where(eq(feePlanClasses.feePlanId, planId))
      }
      if (classIds.length === 0) return planId

      const [{ wrongYear }] = await tx
        .select({ wrongYear: count() })
        .from(classes)
        .where(
          and(
            inArray(classes.id, classIds),
            ne(classes.academicYearId, input.academic_year_id),
          ),
        )
      if (wrongYear > 0)
        throw new DbError(
          "One or more selected classes do not belong to this fee plan's academic year.",
        )

      await tx
        .insert(feePlanClasses)
        .values(classIds.map((classId) => ({ feePlanId: planId, classId })))
      return planId
    })
  } catch (err) {
    throw feePlanError(err)
  }
}

export async function createFeePlan(
  input: FeePlanInput,
  classIds: string[],
): Promise<{ id: string }> {
  return { id: await saveFeePlan(null, input, classIds) }
}

export async function updateFeePlan(
  id: string,
  input: FeePlanInput,
  classIds: string[],
): Promise<void> {
  await saveFeePlan(id, input, classIds)
}
