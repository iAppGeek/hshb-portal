'use server'

import { z } from 'zod'

import type { AttendanceRow } from '@/db'
import {
  getAttendanceByClassAndDate,
  getClassById,
  getCurrentAcademicYear,
  getEnrolmentsForClass,
  saveAttendance,
} from '@/db'
import { ActionError, runAction, type ActionResult } from '@/lib/action'
import { isClassOpen } from '@/lib/classes'
import { buildRegisterRoster } from '@/lib/enrolment'
import { canUpdateAttendance } from '@/lib/permissions'
import { uuid, isoDate, attendanceStatus, optionalString } from '@/lib/schemas'

const attendanceRecordSchema = z.object({
  studentId: uuid,
  status: attendanceStatus,
  notes: optionalString,
})

/** The rows as written, so the form updates in place without a re-fetch. */
export type SavedRegister = {
  classId: string
  className: string
  date: string
  isUpdate: boolean
  saved: AttendanceRow[]
}

export async function saveAttendanceAction(
  formData: FormData,
): Promise<ActionResult<SavedRegister>> {
  return runAction({
    name: 'attendance.save',
    formData,
    // One record per student is read out of the form, so these are parsed here
    // rather than through `runAction`'s single `schema`.
    run: async (_input, { actor, formData }) => {
      const classIdParsed = uuid.safeParse(formData.get('classId'))
      if (!classIdParsed.success) throw new ActionError('Invalid class ID')
      const classId = classIdParsed.data

      const dateParsed = isoDate.safeParse(formData.get('date'))
      if (!dateParsed.success) throw new ActionError('Invalid date')
      const date = dateParsed.data

      const studentIds = formData.getAll('studentId') as string[]

      const [cls, currentYear] = await Promise.all([
        getClassById(classId),
        getCurrentAcademicYear(),
      ])
      if (!cls) throw new ActionError('Class not found')
      if (!isClassOpen(cls, currentYear)) {
        throw new ActionError(
          "This register can't be changed. The class has been completed or is not in the current academic year.",
        )
      }

      const records = studentIds.map((sid) => {
        const parsed = attendanceRecordSchema.safeParse({
          studentId: sid,
          status: formData.get(`status_${sid}`) ?? 'absent',
          notes: formData.get(`notes_${sid}`),
        })
        if (!parsed.success)
          throw new ActionError(parsed.error.issues[0].message)
        return {
          class_id: classId,
          student_id: parsed.data.studentId,
          date,
          status: parsed.data.status,
          notes: parsed.data.notes,
          recorded_by: actor.staffId,
        }
      })

      const [existing, enrolments] = await Promise.all([
        getAttendanceByClassAndDate(classId, date),
        getEnrolmentsForClass(classId),
      ])
      const isUpdate = existing.length > 0

      const roster = new Set(
        buildRegisterRoster(
          existing.map((r) => r.student_id),
          enrolments,
          date,
        ),
      )
      if (studentIds.some((sid) => !roster.has(sid))) {
        throw new ActionError('Student was not in this class on this date')
      }

      if (isUpdate && !canUpdateAttendance(actor.role)) {
        throw new ActionError(
          'You do not have permission to update existing attendance records.',
        )
      }

      const saved = await saveAttendance(records)

      return { classId, className: cls.name, date, isUpdate, saved }
    },
    audit: {
      entity: 'attendance',
      action: ({ isUpdate }) => (isUpdate ? 'update' : 'create'),
      entityId: ({ classId }) => classId,
      details: ({ date, saved }) => ({ date, studentCount: saved.length }),
    },
    notify: ({ className, isUpdate }) => ({
      title: 'Attendance Saved',
      body: `Attendance for ${className} has been ${isUpdate ? 'updated' : 'saved'}`,
      url: '/reports',
    }),
    fallbackError: 'Failed to save attendance. Please try again.',
  })
}
