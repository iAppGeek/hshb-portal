'use server'

import { getStaffPayrollByStaffId, upsertStaffPayroll } from '@/db'
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
      return { saved, existing, record }
    },
    audit: {
      entity: 'staff_payroll',
      action: ({ existing }) => (existing ? 'update' : 'create'),
      entityId: ({ saved }) => saved.id,
      // `redact` is not used: the comparison needs the previous row, so
      // redactChanges runs against `existing` rather than against null.
      details: ({ existing, record }) => ({
        staff_id: staffId,
        ...redactChanges(record, existing, BANK_DETAIL_FIELDS),
      }),
    },
    redirectTo: '/hr',
    fallbackError: 'Failed to save the payroll record. Please try again.',
  })
}
