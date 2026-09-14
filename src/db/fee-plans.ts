import { unstable_cache, updateTag } from 'next/cache'

import type { Database } from '@/types/database'

import { supabase } from './client'

export type FeePlanRow = Database['public']['Tables']['fee_plans']['Row']

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

const FEE_PLAN_SELECT =
  '*, academic_year:academic_years(id, code, start_date, end_date)'

const OPTS = { revalidate: 60, tags: ['fee-plans'] }

/** All plans when `yearId` is omitted (e.g. for the override select's
 * "other years" guard, and for computing prior-year balances). */
export const getFeePlans = unstable_cache(
  async (yearId?: string): Promise<FeePlanWithClasses[]> => {
    let query = supabase.from('fee_plans').select(FEE_PLAN_SELECT)
    if (yearId) query = query.eq('academic_year_id', yearId)
    const [{ data: plans }, { data: links }] = await Promise.all([
      query.order('name'),
      supabase.from('fee_plan_classes').select('fee_plan_id, class_id'),
    ])
    const classIdsByPlan = new Map<string, string[]>()
    for (const link of links ?? []) {
      const ids = classIdsByPlan.get(link.fee_plan_id) ?? []
      ids.push(link.class_id)
      classIdsByPlan.set(link.fee_plan_id, ids)
    }
    return ((plans ?? []) as unknown as FeePlanWithClasses[]).map((p) => ({
      ...p,
      class_ids: classIdsByPlan.get(p.id) ?? [],
    }))
  },
  ['fee-plans'],
  OPTS,
)

export const getFeePlanById = unstable_cache(
  async (id: string): Promise<FeePlanWithClasses | null> => {
    const { data: plan } = await supabase
      .from('fee_plans')
      .select(FEE_PLAN_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (!plan) return null
    const { data: links } = await supabase
      .from('fee_plan_classes')
      .select('class_id')
      .eq('fee_plan_id', id)
    return {
      ...(plan as unknown as FeePlanWithClasses),
      class_ids: (links ?? []).map((l) => l.class_id),
    }
  },
  ['fee-plan-by-id'],
  OPTS,
)

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
  updateTag('fee-plans')
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
