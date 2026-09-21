'use server'

import type { Actor } from '@/auth/require'
import { signInStaff, signOutStaff } from '@/db'
import {
  ActionError,
  NOT_AUTHORISED,
  runAction,
  type ActionResult,
} from '@/lib/action'
import { schoolTzToUtcIso } from '@/lib/datetime'
import { canManageStaffAttendance } from '@/lib/permissions'
import { staffAttendanceSchema } from '@/lib/schemas'

/**
 * Anyone may sign themselves in or out; only managers may do it on someone
 * else's behalf. The target comes from the form, so this cannot be a
 * `permission` check — it needs the parsed input.
 */
function assertMayRecord(actor: Actor, targetStaffId: string): void {
  if (!canManageStaffAttendance(actor.role) && targetStaffId !== actor.staffId)
    throw new ActionError(NOT_AUTHORISED)
}

export async function signInAction(formData: FormData): Promise<ActionResult> {
  return runAction({
    name: 'staff-attendance.sign-in',
    schema: staffAttendanceSchema,
    formData,
    run: async ({ staffId, date, time }, { actor }) => {
      assertMayRecord(actor, staffId)
      await signInStaff(staffId, date, schoolTzToUtcIso(date, time))
    },
    audit: {
      entity: 'staff_attendance',
      action: 'sign_in',
      entityId: (_result, input) => input.staffId,
      details: (_result, input) => ({ date: input.date, time: input.time }),
    },
    fallbackError: 'Failed to sign in. Please try again.',
  })
}

export async function signOutAction(formData: FormData): Promise<ActionResult> {
  return runAction({
    name: 'staff-attendance.sign-out',
    schema: staffAttendanceSchema,
    formData,
    run: async ({ staffId, date, time }, { actor }) => {
      assertMayRecord(actor, staffId)
      await signOutStaff(staffId, date, schoolTzToUtcIso(date, time))
    },
    audit: {
      entity: 'staff_attendance',
      action: 'sign_out',
      entityId: (_result, input) => input.staffId,
      details: (_result, input) => ({ date: input.date, time: input.time }),
    },
    fallbackError: 'Failed to sign out. Please try again.',
  })
}
