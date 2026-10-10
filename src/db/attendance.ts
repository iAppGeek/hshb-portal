import 'server-only'

import { and, asc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'

import type { AttendanceRangeRow, SummaryClass } from '@/lib/attendanceSummary'

import { camelKey, toCamel, toSnake, type Snake } from './casing'
import { db } from './client'
import {
  academicYears,
  attendance,
  attendanceRegisters,
  classes,
  type Attendance,
  type NewAttendance,
} from './schema'

export type AttendanceStatus = Attendance['status']
export type AttendanceInsert = Snake<NewAttendance>
export type AttendanceRow = Snake<Attendance>

/** The register a save belongs to, with its session note. */
export type RegisterSave = {
  classId: string
  date: string
  notes: string | null
  updatedBy: string
}

/** When a register was first taken and last saved. */
export type RegisterRow = {
  classId: string
  date: string
  createdAt: string | null
  updatedAt: string | null
}

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

/** The register for a class and date, or null when it has not been taken. */
export async function getRegister(
  classId: string,
  date: string,
): Promise<{ notes: string | null } | null> {
  const [row] = await db
    .select({ notes: attendanceRegisters.notes })
    .from(attendanceRegisters)
    .where(
      and(
        eq(attendanceRegisters.classId, classId),
        eq(attendanceRegisters.date, date),
      ),
    )
  return row ?? null
}

/** Registers taken across a date range: one per class per date. */
export async function getRegistersByDateRange(
  startDate: string,
  endDate: string,
): Promise<RegisterRow[]> {
  return db
    .select({
      classId: attendanceRegisters.classId,
      date: attendanceRegisters.date,
      createdAt: attendanceRegisters.createdAt,
      updatedAt: attendanceRegisters.updatedAt,
    })
    .from(attendanceRegisters)
    .where(
      and(
        gte(attendanceRegisters.date, startDate),
        lte(attendanceRegisters.date, endDate),
      ),
    )
    .orderBy(asc(attendanceRegisters.id))
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
 * same class, student and date, and the register's own row with its session
 * note. On conflict only the columns the records carry are overwritten. Both
 * land in one transaction, so marks and note are never half-saved.
 */
export async function saveAttendance(
  records: AttendanceInsert[],
  register: RegisterSave,
): Promise<AttendanceRow[]> {
  if (records.length === 0) return []
  const updated = [...new Set(records.flatMap((r) => Object.keys(r)))].filter(
    (key) => !CONFLICT_KEYS.includes(key),
  )
  const set: Record<string, SQL> = Object.fromEntries(
    updated.map((key) => [camelKey(key), sql`excluded.${sql.identifier(key)}`]),
  )
  const rows = await db.transaction(async (tx) => {
    const saved = await tx
      .insert(attendance)
      .values(records.map(toCamel))
      .onConflictDoUpdate({
        target: [attendance.classId, attendance.studentId, attendance.date],
        set,
      })
      .returning()
    await tx
      .insert(attendanceRegisters)
      .values(register)
      .onConflictDoUpdate({
        target: [attendanceRegisters.classId, attendanceRegisters.date],
        set: {
          notes: register.notes,
          updatedBy: register.updatedBy,
          updatedAt: sql`now()`,
        },
      })
    return saved
  })
  return toSnake(rows)
}
