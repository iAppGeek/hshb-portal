'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import {
  getStaffPayrollByStaffId,
  logAuditEvent,
  upsertStaffPayroll,
} from '@/db'
import { BANK_DETAIL_FIELDS, redactChanges } from '@/lib/audit-redaction'
import { getUserFriendlyDbError } from '@/lib/db-error'
import { canManageFinance } from '@/lib/permissions'
import {
  extractFormFields,
  staffPayrollSchema,
  type ActionResult,
} from '@/lib/schemas'
import type { StaffRole } from '@/types/next-auth'

export async function saveStaffPayrollAction(
  staffId: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth()
  if (!session) return { error: 'Not authenticated' }
  const role = session.user.role as StaffRole
  if (!canManageFinance(role)) return { error: 'Not authorised' }
  const actorId = session.user.staffId ?? null

  const parsed = staffPayrollSchema.safeParse(extractFormFields(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const data = parsed.data

  try {
    const existing = await getStaffPayrollByStaffId(staffId)
    // A check keeps its original verifier while it stays verified; a newly
    // verified check is attributed to the admin saving it.
    const record = {
      ...data,
      id_verified_by: data.id_verified
        ? ((existing?.id_verified ? existing.id_verified_by : null) ?? actorId)
        : null,
      dbs_verified_by: data.dbs_verified
        ? ((existing?.dbs_verified ? existing.dbs_verified_by : null) ??
          actorId)
        : null,
    }
    const saved = await upsertStaffPayroll(staffId, record)

    logAuditEvent({
      staffId: actorId,
      action: existing ? 'update' : 'create',
      entity: 'staff_payroll',
      entityId: saved.id,
      details: {
        staff_id: staffId,
        ...redactChanges(record, existing, BANK_DETAIL_FIELDS),
      },
    })
    revalidatePath('/finance')
  } catch (err) {
    console.error('[saveStaffPayrollAction] error:', err)
    return {
      error: getUserFriendlyDbError(
        err,
        'Failed to save the payroll record. Please try again.',
      ),
    }
  }

  redirect('/finance?tab=staff')
}
