import 'server-only'

import { and, asc, count, eq, gte, lte } from 'drizzle-orm'

import { toSnake, type Snake } from './casing'
import { db } from './client'
import { staffAttendance, type StaffAttendance } from './schema'

export type StaffAttendanceRow = Snake<StaffAttendance>

/** Fetch a single staff member's attendance record for a given date. Returns null if not found. */
export async function getStaffAttendanceForToday(
  staffId: string,
  date: string,
): Promise<StaffAttendanceRow | null> {
  const [row] = await db
    .select()
    .from(staffAttendance)
    .where(
      and(eq(staffAttendance.staffId, staffId), eq(staffAttendance.date, date)),
    )
  return row ? toSnake(row) : null
}

/** Fetch all staff attendance records for a given date. */
export async function getStaffAttendanceByDate(
  date: string,
): Promise<StaffAttendanceRow[]> {
  const rows = await db
    .select()
    .from(staffAttendance)
    .where(eq(staffAttendance.date, date))
  return toSnake(rows)
}

/**
 * Upsert a sign-in record. On conflict (staff_id, date) updates signed_in_at
 * and clears signed_out_at (supports re-sign-in after sign-out).
 */
export async function signInStaff(
  staffId: string,
  date: string,
  signedInAt: string,
): Promise<StaffAttendanceRow> {
  const [row] = await db
    .insert(staffAttendance)
    .values({ staffId, date, signedInAt, signedOutAt: null })
    .onConflictDoUpdate({
      target: [staffAttendance.staffId, staffAttendance.date],
      set: { signedInAt, signedOutAt: null },
    })
    .returning()
  return toSnake(row)
}

/**
 * Update the signed_out_at timestamp for an existing record. Null when there
 * was no record to update — a no-op, as before, rather than an error.
 */
export async function signOutStaff(
  staffId: string,
  date: string,
  signedOutAt: string,
): Promise<StaffAttendanceRow | null> {
  const [row] = await db
    .update(staffAttendance)
    .set({ signedOutAt })
    .where(
      and(eq(staffAttendance.staffId, staffId), eq(staffAttendance.date, date)),
    )
    .returning()
  return row ? toSnake(row) : null
}

/** Fetch all staff attendance records within a date range (inclusive). */
export async function getStaffAttendanceByDateRange(
  startDate: string,
  endDate: string,
): Promise<StaffAttendanceRow[]> {
  const rows = await db
    .select()
    .from(staffAttendance)
    .where(
      and(
        gte(staffAttendance.date, startDate),
        lte(staffAttendance.date, endDate),
      ),
    )
    .orderBy(asc(staffAttendance.date))
  return toSnake(rows)
}

/**
 * Count of staff who signed in at any point on a date, regardless of whether
 * they have since signed out.
 */
export async function getStaffAttendedCount(date: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(staffAttendance)
    .where(eq(staffAttendance.date, date))
  return n
}
