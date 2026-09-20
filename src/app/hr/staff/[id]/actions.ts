'use server'

import {
  getStaffPayrollByStaffId,
  logAuditEvent,
  upsertStaffPayroll,
} from '@/db'
import { runAction, type ActionResult } from '@/lib/action'
import { BANK_DETAIL_FIELDS, redactChanges } from '@/lib/audit-redaction'
import { canManageHr } from '@/lib/permissions'
import { staffPayrollSchema } from '@/lib/schemas'

export async function saveStaffPayrollAction(
  staffId: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'hr.payroll.save',
    permission: canManageHr,
    schema: staffPayrollSchema,
    formData,
    run: async (data, { actor }) => {
      const existing = await getStaffPayrollByStaffId(staffId)
      // A check keeps its original verifier while it stays verified; a newly
      // verified check is attributed to the admin saving it.
      const record = {
        ...data,
        id_verified_by: data.id_verified
          ? ((existing?.id_verified ? existing.id_verified_by : null) ??
            actor.staffId)
          : null,
        dbs_verified_by: data.dbs_verified
          ? ((existing?.dbs_verified ? existing.dbs_verified_by : null) ??
            actor.staffId)
          : null,
      }
      const saved = await upsertStaffPayroll(staffId, record)

      // Logged here rather than through `runAction`'s `audit` option: the
      // action name depends on whether a row already existed, and the
      // redaction compares against that row rather than against null.
      logAuditEvent({
        staffId: actor.staffId,
        action: existing ? 'update' : 'create',
        entity: 'staff_payroll',
        entityId: saved.id,
        details: {
          staff_id: staffId,
          ...redactChanges(record, existing, BANK_DETAIL_FIELDS),
        },
      })
    },
    revalidate: ['/hr'],
    redirectTo: '/hr',
    fallbackError: 'Failed to save the payroll record. Please try again.',
  })
}
