import 'server-only'

import { asc, eq } from 'drizzle-orm'

import { toCamel, toSnake, type Snake } from './casing'
import { db } from './client'
import {
  staff,
  staffPayroll,
  type NewStaffPayroll,
  type StaffPayroll,
} from './schema'

export type StaffPayrollRow = Snake<StaffPayroll>

export type StaffPayrollInput = Omit<
  Snake<NewStaffPayroll>,
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
export async function getStaffPayrollList(): Promise<StaffPayrollListItem[]> {
  const rows = await db.query.staff.findMany({
    columns: {
      id: true,
      title: true,
      firstName: true,
      lastName: true,
      role: true,
    },
    with: { payroll: true },
    orderBy: asc(staff.lastName),
  })
  return toSnake(rows)
}

export async function getStaffPayrollByStaffId(
  staffId: string,
): Promise<StaffPayrollRow | null> {
  const [row] = await db
    .select()
    .from(staffPayroll)
    .where(eq(staffPayroll.staffId, staffId))
  return row ? toSnake(row) : null
}

export async function upsertStaffPayroll(
  staffId: string,
  input: StaffPayrollInput,
): Promise<StaffPayrollRow> {
  const values = toCamel(input)
  const [row] = await db
    .insert(staffPayroll)
    .values({ ...values, staffId })
    .onConflictDoUpdate({ target: staffPayroll.staffId, set: values })
    .returning()
  return toSnake(row)
}
