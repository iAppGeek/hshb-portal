'use server'

import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import { purgeActionedSubmissions, logAuditEvent } from '@/db'
import { getUserFriendlyDbError } from '@/lib/db-error'
import { canAccessAdminTasks } from '@/lib/permissions'
import { SUBMISSION_RETENTION_DAYS } from '@/lib/registration'
import type { StaffRole } from '@/types/next-auth'

export type PurgeActionedSubmissionsResult =
  | { error: string }
  | { success: true; removed: number }

export async function purgeActionedSubmissionsAction(): Promise<PurgeActionedSubmissionsResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canAccessAdminTasks(role)) return { error: 'Not authorised' }
  const staffId = session.user.staffId ?? null

  try {
    const removed = await purgeActionedSubmissions()

    logAuditEvent({
      staffId,
      action: 'submissions_purged',
      entity: 'registration_submission',
      details: { removed, olderThanDays: SUBMISSION_RETENTION_DAYS },
    })
    revalidatePath('/registrations')
    revalidatePath('/dashboard')

    return { success: true, removed }
  } catch (err) {
    console.error('[purgeActionedSubmissionsAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to purge actioned submissions. Please try again.',
      ),
    }
  }
}
