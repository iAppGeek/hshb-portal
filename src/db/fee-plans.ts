import 'server-only'

import { asc, eq } from 'drizzle-orm'

import type { Database } from '@/types/database'

import { toSnake, type Snake } from './casing'
import { db, supabase } from './client'
import { feePlans, type FeePlan } from './schema'

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
  const row = await db.query.feePlans.findFirst({
    with: feePlanWith,
    where: eq(feePlans.id, id),
  })
  return row ? toSnake(withClassIds(row)) : null
}

// The plan and its class links are written in one transaction by the
// save_fee_plan RPC, so a rejected link never leaves a half-saved plan.
async function saveFeePlan(
  id: string | null,
  input: FeePlanInput,
  classIds: string[],
): Promise<string> {
  // Supabase codegen types p_id and p_notes as `string`, but the Postgres
  // function accepts NULL for both (NULL p_id creates a plan).
  const { data, error } = await supabase.rpc('save_fee_plan', {
    p_id: id,
    p_name: input.name,
    p_academic_year_id: input.academic_year_id,
    p_full_year_amount: input.full_year_amount,
    p_monthly_instalment_amount: input.monthly_instalment_amount,
    p_termly_instalment_amount: input.termly_instalment_amount,
    p_notes: input.notes,
    p_active: input.active,
    p_class_ids: classIds,
  } as Database['public']['Functions']['save_fee_plan']['Args'])
  if (error) throw error
  return data as string
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
