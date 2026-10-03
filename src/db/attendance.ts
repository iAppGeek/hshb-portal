import 'server-only'

import { and, asc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'

import type { AttendanceRangeRow, SummaryClass } from '@/lib/attendanceSummary'

import { camelKey, toCamel, toSnake, type Snake } from './casing'
import { db } from './client'
import {
  academicYears,
  attendance,
  classes,
  type Attendance,
  type NewAttendance,
} from './schema'

export type AttendanceStatus = Attendance['status']
export type AttendanceInsert = Snake<NewAttendance>
export type AttendanceRow = Snake<Attendance>

const CONFLICT_KEYS = ['class_id', 'student_id', 'date']

export async function getAttendanceByClassAndDate(
  classId: string,
  date: string,
): Promise<AttendanceRow[]> {
  const rows = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.classId, classId), eq(attendance.date, date)))
  return toSnake(rows)
}

/** Attendance rows across a date range, with their class, for aggregation. */
export async function getAttendanceByDateRange(
  startDate: string,
  endDate: string,
): Promise<(AttendanceRangeRow & { class: SummaryClass })[]> {
  return db
    .select({
      classId: attendance.classId,
      studentId: attendance.studentId,
      date: attendance.date,
      status: attendance.status,
      createdAt: attendance.createdAt,
      updatedAt: attendance.updatedAt,
      class: {
        id: classes.id,
        name: classes.name,
        yearGroup: classes.yearGroup,
        active: classes.active,
        yearCode: academicYears.code,
      },
    })
    .from(attendance)
    .innerJoin(classes, eq(classes.id, attendance.classId))
    .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
    .where(and(gte(attendance.date, startDate), lte(attendance.date, endDate)))
    .orderBy(asc(attendance.id))
}

/**
 * Saves a register: one row per student, updating an existing mark for the
 * same class, student and date. On conflict only the columns the records
 * carry are overwritten.
 */
export async function saveAttendance(
  records: AttendanceInsert[],
): Promise<AttendanceRow[]> {
  if (records.length === 0) return []
  const updated = [...new Set(records.flatMap((r) => Object.keys(r)))].filter(
    (key) => !CONFLICT_KEYS.includes(key),
  )
  const set: Record<string, SQL> = Object.fromEntries(
    updated.map((key) => [camelKey(key), sql`excluded.${sql.identifier(key)}`]),
  )
  const rows = await db
    .insert(attendance)
    .values(records.map(toCamel))
    .onConflictDoUpdate({
      target: [attendance.classId, attendance.studentId, attendance.date],
      set,
    })
    .returning()
  return toSnake(rows)
}
