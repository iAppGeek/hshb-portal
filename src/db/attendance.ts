import 'server-only'

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { union } from 'drizzle-orm/pg-core'

import type { AttendanceRangeRow, SummaryClass } from '@/lib/attendanceSummary'
import type {
  DayStatus,
  StudentAttendanceDay,
  StudentAttendanceTotals,
} from '@/lib/studentAttendance'

import { camelKey, toCamel, toSnake, type Snake } from './casing'
import { db } from './client'
import {
  academicYears,
  attendance,
  attendanceRegisters,
  classes,
  studentClasses,
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
  /** Undefined leaves the saved note unchanged; null clears it. */
  notes: string | null | undefined
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
): Promise<{ saved: AttendanceRow[]; notes: string | null }> {
  if (records.length === 0) return { saved: [], notes: register.notes ?? null }
  const updated = [...new Set(records.flatMap((r) => Object.keys(r)))].filter(
    (key) => !CONFLICT_KEYS.includes(key),
  )
  const set: Record<string, SQL> = Object.fromEntries(
    updated.map((key) => [camelKey(key), sql`excluded.${sql.identifier(key)}`]),
  )
  const { rows, notes } = await db.transaction(async (tx) => {
    const saved = await tx
      .insert(attendance)
      .values(records.map(toCamel))
      .onConflictDoUpdate({
        target: [attendance.classId, attendance.studentId, attendance.date],
        set,
      })
      .returning()
    const [stored] = await tx
      .insert(attendanceRegisters)
      .values({ ...register, notes: register.notes ?? null })
      .onConflictDoUpdate({
        target: [attendanceRegisters.classId, attendanceRegisters.date],
        set: {
          ...(register.notes !== undefined && { notes: register.notes }),
          updatedBy: register.updatedBy,
          updatedAt: sql`now()`,
        },
      })
      .returning({ notes: attendanceRegisters.notes })
    return { rows: saved, notes: stored.notes }
  })
  return { saved: toSnake(rows), notes }
}

/**
 * Who was on each taken register in the range: enrolled that day, or marked.
 * `union` drops a student who is both. Filters go in both branches so the
 * student and class indexes can be used.
 */
function registerRoster(
  startDate: string,
  endDate: string,
  opts: { studentId?: string; classId?: string } = {},
) {
  const inRange = and(
    gte(attendanceRegisters.date, startDate),
    lte(attendanceRegisters.date, endDate),
    opts.classId ? eq(attendanceRegisters.classId, opts.classId) : undefined,
  )
  const enrolled = db
    .select({
      classId: attendanceRegisters.classId,
      date: attendanceRegisters.date,
      studentId: studentClasses.studentId,
    })
    .from(attendanceRegisters)
    .innerJoin(
      studentClasses,
      and(
        eq(studentClasses.classId, attendanceRegisters.classId),
        lte(studentClasses.startDate, attendanceRegisters.date),
        or(
          isNull(studentClasses.endDate),
          gt(studentClasses.endDate, attendanceRegisters.date),
        ),
        opts.studentId
          ? eq(studentClasses.studentId, opts.studentId)
          : undefined,
      ),
    )
    .where(inRange)
  const marked = db
    .select({
      classId: attendanceRegisters.classId,
      date: attendanceRegisters.date,
      studentId: attendance.studentId,
    })
    .from(attendanceRegisters)
    .innerJoin(
      attendance,
      and(
        eq(attendance.classId, attendanceRegisters.classId),
        eq(attendance.date, attendanceRegisters.date),
        opts.studentId ? eq(attendance.studentId, opts.studentId) : undefined,
      ),
    )
    .where(inRange)
  return union(enrolled, marked)
}

/** One row per student per day, best mark across that day's classes. */
function studentDays(startDate: string, endDate: string, studentId?: string) {
  const roster = db
    .$with('register_roster')
    .as(registerRoster(startDate, endDate, { studentId }))
  const days = db.$with('student_days').as(
    db
      .select({
        studentId: roster.studentId,
        date: roster.date,
        status: sql<DayStatus>`case
          when bool_or(${attendance.status} = 'present') then 'present'
          when bool_or(${attendance.status} = 'late') then 'late'
          when bool_or(${attendance.status} = 'absent') then 'absent'
          else 'unmarked'
        end`.as('status'),
        classNames: sql<
          string[]
        >`array_agg(distinct ${classes.name} order by ${classes.name})`.as(
          'class_names',
        ),
      })
      .from(roster)
      .innerJoin(classes, eq(classes.id, roster.classId))
      .leftJoin(
        attendance,
        and(
          eq(attendance.classId, roster.classId),
          eq(attendance.date, roster.date),
          eq(attendance.studentId, roster.studentId),
        ),
      )
      .groupBy(roster.studentId, roster.date),
  )
  return { roster, days }
}

function countWhere(condition: SQL): SQL<number> {
  return sql<number>`count(*) filter (where ${condition})`.mapWith(Number)
}

/** Every possible day for the student in the range, newest first. */
export async function getStudentAttendanceDays(
  studentId: string,
  startDate: string,
  endDate: string,
): Promise<StudentAttendanceDay[]> {
  const { roster, days } = studentDays(startDate, endDate, studentId)
  const rows = await db
    .with(roster, days)
    .select({
      date: days.date,
      status: days.status,
      classNames: days.classNames,
    })
    .from(days)
    .orderBy(desc(days.date))
  return rows.map((row) => ({
    date: row.date,
    status: row.status,
    classNames: row.classNames ?? [],
  }))
}

/** Day counts for one student. Zeros when no register was taken. */
export async function getStudentAttendanceTotals(
  studentId: string,
  startDate: string,
  endDate: string,
): Promise<StudentAttendanceTotals> {
  const { roster, days } = studentDays(startDate, endDate, studentId)
  const [row] = await db
    .with(roster, days)
    .select({
      possible: sql<number>`count(*)`.mapWith(Number),
      attended: countWhere(sql`${days.status} in ('present', 'late')`),
      late: countWhere(sql`${days.status} = 'late'`),
      absent: countWhere(sql`${days.status} = 'absent'`),
      unmarked: countWhere(sql`${days.status} = 'unmarked'`),
    })
    .from(days)
  return {
    studentId,
    possible: row?.possible ?? 0,
    attended: row?.attended ?? 0,
    late: row?.late ?? 0,
    absent: row?.absent ?? 0,
    unmarked: row?.unmarked ?? 0,
  }
}
