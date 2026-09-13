import { unstable_cache, updateTag } from 'next/cache'

import type { Database } from '@/types/database'

import { supabase } from './client'

type PayrollTable = Database['public']['Tables']['staff_payroll']

export type StaffPayrollRow = PayrollTable['Row']

export type StaffPayrollInput = Omit<
  PayrollTable['Insert'],
  'id' | 'staff_id' | 'created_at' | 'updated_at'
>

export type StaffPayrollListItem = {
  id: string
  title: string
  first_name: string
  last_name: string
  role: string
  payroll: StaffPayrollRow | null
}

// Payroll rows are lazy (decision 14), so the list starts from staff and
// attaches a record where one exists.
export const getStaffPayrollList = unstable_cache(
  async (): Promise<StaffPayrollListItem[]> => {
    const [{ data: staff }, { data: payroll }] = await Promise.all([
      supabase
        .from('staff')
        .select('id, title, first_name, last_name, role')
        .order('last_name'),
      supabase.from('staff_payroll').select('*'),
    ])
    const byStaffId = new Map((payroll ?? []).map((p) => [p.staff_id, p]))
    return (staff ?? []).map((s) => ({
      ...s,
      payroll: byStaffId.get(s.id) ?? null,
    }))
  },
  ['staff-payroll-list'],
  { revalidate: 60, tags: ['staff', 'staff-payroll'] },
)

export const getStaffPayrollByStaffId = unstable_cache(
  async (staffId: string): Promise<StaffPayrollRow | null> => {
    const { data } = await supabase
      .from('staff_payroll')
      .select('*')
      .eq('staff_id', staffId)
      .maybeSingle()
    return data
  },
  ['staff-payroll-by-staff-id'],
  { revalidate: 60, tags: ['staff-payroll'] },
)

export async function upsertStaffPayroll(
  staffId: string,
  input: StaffPayrollInput,
): Promise<StaffPayrollRow> {
  const { data, error } = await supabase
    .from('staff_payroll')
    .upsert({ ...input, staff_id: staffId }, { onConflict: 'staff_id' })
    .select()
    .single()
  if (error) throw error
  updateTag('staff-payroll')
  return data
}
