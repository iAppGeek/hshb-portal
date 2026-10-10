import 'server-only'

import { and, eq, inArray, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { union } from 'drizzle-orm/pg-core'

import {
  canReviewRegistrations,
  isTeacher,
  TEACHING_ROLES,
} from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import { db } from './client'
import { enrolledOn, studentIdsTaughtBy } from './membership'
import {
  academicYears,
  attendance,
  attendanceRegisters,
  classes,
  incidents,
  lessonPlans,
  registrationSubmissions,
  staff,
  studentClasses,
  students,
} from './schema'

export type DashboardStats = {
  /** Active students; for a teacher, the ones in their classes. */
  studentCount: number
  /** Active classes this year; for a teacher, their own. */
  classCount: number
  /** The rest are null for a teacher, who doesn't see them. */
  teacherCount: number | null
  incidentCount: number | null
  lessonPlansToday: number | null
  /** Distinct students marked present or late today. */
  presentToday: number | null
  /** Distinct students on any register today: enrolled or already marked. */
  enrolledToday: number | null
  /** Registers taken today. */
  registersTakenToday: number | null
  /** Null unless the role reviews registrations. */
  pendingRegistrationCount: number | null
}

/** The number of rows a query returns, as a sub-select. */
function countOf(query: SQLWrapper): SQL<number> {
  return sql<number>`(select count(*) from (${query}) as counted)`.mapWith(
    Number,
  )
}

/**
 * Every figure the dashboard shows, in one SQL statement: each is a
 * sub-select, evaluated against the current academic year's row. Attendance
 * figures follow summariseAttendance: a register's roster is everyone
 * enrolled on the day plus anyone already marked.
 */
export async function getDashboardStats(
  actor: { role: StaffRole; staffId: string },
  today: string,
): Promise<DashboardStats> {
  const teacherOnly = isTeacher(actor.role)
  const markedToday = eq(attendance.date, today)

  const studentFilter = teacherOnly
    ? and(
        eq(students.active, true),
        inArray(students.id, studentIdsTaughtBy(actor.staffId)),
      )
    : eq(students.active, true)
  const classFilter = and(
    eq(classes.academicYearId, academicYears.id),
    eq(classes.active, true),
    teacherOnly ? eq(classes.teacherId, actor.staffId) : undefined,
  )
  const onRegisterToday = union(
    db.select({ id: attendance.studentId }).from(attendance).where(markedToday),
    db
      .select({ id: studentClasses.studentId })
      .from(studentClasses)
      .where(enrolledOn(studentClasses, today)),
  )
  const presentToday = db
    .selectDistinct({ id: attendance.studentId })
    .from(attendance)
    .where(and(markedToday, inArray(attendance.status, ['present', 'late'])))
  const [row] = await db
    .select({
      studentCount: db.$count(students, studentFilter),
      classCount: db.$count(classes, classFilter),
      teacherCount: db.$count(staff, inArray(staff.role, TEACHING_ROLES)),
      incidentCount: db.$count(incidents),
      lessonPlansToday: db.$count(
        lessonPlans,
        eq(lessonPlans.lessonDate, today),
      ),
      presentToday: countOf(presentToday),
      enrolledToday: countOf(onRegisterToday),
      registersTakenToday: db.$count(
        attendanceRegisters,
        eq(attendanceRegisters.date, today),
      ),
      pendingRegistrationCount: db.$count(
        registrationSubmissions,
        eq(registrationSubmissions.status, 'pending'),
      ),
    })
    .from(academicYears)
    .where(eq(academicYears.isCurrent, true))
  if (!row) throw new Error('No current academic year is set')

  const staffFigure = (n: number): number | null => (teacherOnly ? null : n)
  return {
    studentCount: row.studentCount,
    classCount: row.classCount,
    teacherCount: staffFigure(row.teacherCount),
    incidentCount: staffFigure(row.incidentCount),
    lessonPlansToday: staffFigure(row.lessonPlansToday),
    presentToday: staffFigure(row.presentToday),
    enrolledToday: staffFigure(row.enrolledToday),
    registersTakenToday: staffFigure(row.registersTakenToday),
    pendingRegistrationCount: canReviewRegistrations(actor.role)
      ? row.pendingRegistrationCount
      : null,
  }
}
