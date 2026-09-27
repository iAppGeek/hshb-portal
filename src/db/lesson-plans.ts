import 'server-only'

import { and, count, desc, eq, inArray } from 'drizzle-orm'

import { toCamel, toSnake } from './casing'
import { db, type Tx } from './client'
import { lessonPlans } from './schema'

export type LessonPlanRow = {
  id: string
  class_id: string
  lesson_date: string
  description: string
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
  class: { id: string; name: string; year_group: string }
  creator: { id: string; first_name: string; last_name: string }
  updater: { id: string; first_name: string; last_name: string } | null
}

const person = {
  columns: { id: true, firstName: true, lastName: true },
} as const
const lessonPlanWith = {
  class: { columns: { id: true, name: true, yearGroup: true } },
  creator: person,
  updater: person,
} as const

async function findLessonPlan(
  tx: Tx | typeof db,
  id: string,
): Promise<LessonPlanRow | null> {
  const row = await tx.query.lessonPlans.findFirst({
    where: eq(lessonPlans.id, id),
    with: lessonPlanWith,
  })
  return row ? toSnake(row) : null
}

export async function getLessonPlanCount(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(lessonPlans)
  return n
}

export async function getLessonPlanCountByDate(date: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(lessonPlans)
    .where(eq(lessonPlans.lessonDate, date))
  return n
}

export async function getLessonPlans(options?: {
  classId?: string
  classIds?: string[]
  limit?: number
  offset?: number
}): Promise<LessonPlanRow[]> {
  const classIds = options?.classIds ?? []
  const rows = await db.query.lessonPlans.findMany({
    with: lessonPlanWith,
    where: and(
      options?.classId ? eq(lessonPlans.classId, options.classId) : undefined,
      classIds.length > 0 ? inArray(lessonPlans.classId, classIds) : undefined,
    ),
    orderBy: desc(lessonPlans.lessonDate),
    limit: options?.limit,
    offset: options?.limit !== undefined ? (options.offset ?? 0) : undefined,
  })
  return toSnake(rows)
}

export async function getLessonPlanById(
  id: string,
): Promise<LessonPlanRow | null> {
  return findLessonPlan(db, id)
}

export async function createLessonPlan(data: {
  class_id: string
  lesson_date: string
  description: string
  created_by: string
}): Promise<LessonPlanRow> {
  return db.transaction(async (tx) => {
    const [{ id }] = await tx
      .insert(lessonPlans)
      .values(toCamel(data))
      .returning({ id: lessonPlans.id })
    return (await findLessonPlan(tx, id))!
  })
}

export async function updateLessonPlan(
  id: string,
  data: {
    lesson_date?: string
    description?: string
    updated_by: string
  },
): Promise<LessonPlanRow> {
  return db.transaction(async (tx) => {
    await tx
      .update(lessonPlans)
      .set(toCamel(data))
      .where(eq(lessonPlans.id, id))
    const row = await findLessonPlan(tx, id)
    if (!row) throw new Error('Lesson plan not found')
    return row
  })
}
