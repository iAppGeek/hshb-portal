'use server'

import { z } from 'zod'

import {
  getAttendanceByClassAndDate,
  getClassById,
  getCurrentAcademicYear,
  getAdminSubscriptions,
  deletePushSubscription,
  getEnrolmentsForClass,
  saveAttendance,
} from '@/db'
import { ActionError, runAction, type ActionResult } from '@/lib/action'
import { isClassOpen } from '@/lib/classes'
import { buildRegisterRoster } from '@/lib/enrolment'
import { canUpdateAttendance } from '@/lib/permissions'
import { uuid, isoDate, attendanceStatus, optionalString } from '@/lib/schemas'
import { sendPushNotification } from '@/lib/push'

const attendanceRecordSchema = z.object({
  studentId: uuid,
  status: attendanceStatus,
  notes: optionalString,
})

/** Plan 12 moves this out of the action. */
function notifyOthers(
  className: string,
  staffId: string,
  isUpdate: boolean,
): void {
  getAdminSubscriptions()
    .then((subs) => {
      const others = subs.filter((sub) => sub.staff_id !== staffId)
      return Promise.allSettled(
        others.map((sub) =>
          sendPushNotification(sub, {
            title: 'Attendance Saved',
            body: `Attendance for ${className} has been ${isUpdate ? 'updated' : 'saved'}`,
            data: { url: '/reports' },
          }).catch((err: unknown) => {
            if (
              err instanceof Error &&
              'statusCode' in err &&
              (err as { statusCode: number }).statusCode === 410
            ) {
              return deletePushSubscription(sub.endpoint)
            }
          }),
        ),
      )
    })
    .catch(() => {})
}

export async function saveAttendanceAction(
  formData: FormData,
): Promise<ActionResult> {
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

      await saveAttendance(records)

      notifyOthers(cls.name, actor.staffId, isUpdate)

      return { classId, date, count: records.length, isUpdate }
    },
    audit: {
      entity: 'attendance',
      action: ({ isUpdate }) => (isUpdate ? 'update' : 'create'),
      entityId: ({ classId }) => classId,
      details: ({ date, count }) => ({ date, studentCount: count }),
    },
    fallbackError: 'Failed to save attendance. Please try again.',
  })
}
