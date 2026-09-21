'use server'

import type { z } from 'zod'

import {
  createStudent,
  getGuardianById,
  getStudentById,
  markStudentAsLeaver,
  updateStudent,
  updateStudentClasses,
} from '@/db'
import {
  ActionError,
  firstFieldErrors,
  runAction,
  type ActionResult,
} from '@/lib/action'
import { resolveGuardianSlot } from '@/lib/guardians/resolveGuardian'
import { canCreateStudents, canEditStudents } from '@/lib/permissions'
import {
  createStudentSchema,
  updateStudentSchema,
  guardianSchema,
  guardianSchemaWithOccupation,
  leaverSchema,
  extractFormFields,
} from '@/lib/schemas'

function parseOrThrow<T>(schema: z.ZodType<T>, fields: unknown): T {
  const parsed = schema.safeParse(fields)
  if (!parsed.success)
    throw new ActionError(
      parsed.error.issues[0].message,
      firstFieldErrors(parsed.error),
    )
  return parsed.data
}

/**
 * The columns both creating and editing write: the student's own details,
 * the guardian links (creating any new guardians) and the address source.
 */
async function studentFields(
  formData: FormData,
  d: z.infer<typeof createStudentSchema>,
): Promise<Parameters<typeof createStudent>[0]> {
  const primaryGuardianId = await resolveGuardianSlot(
    formData,
    'primary',
    guardianSchemaWithOccupation,
  )

  const secondaryGuardianId = d.has_secondary
    ? await resolveGuardianSlot(
        formData,
        'secondary',
        guardianSchemaWithOccupation,
      )
    : null

  const contact1Id = d.has_contact1
    ? await resolveGuardianSlot(formData, 'contact1', guardianSchema)
    : null

  const contact2Id = d.has_contact2
    ? await resolveGuardianSlot(formData, 'contact2', guardianSchema)
    : null

  const addressGuardianId =
    d.address_guardian_id === 'primary' ? primaryGuardianId : null

  if (addressGuardianId) {
    const guardian = await getGuardianById(addressGuardianId)
    if (!guardian?.address_line_1 || !guardian?.city || !guardian?.postcode)
      throw new ActionError(
        'The selected guardian does not have an address. Add their address first.',
      )
  } else if (
    !d.student_address_line_1 ||
    !d.student_city ||
    !d.student_postcode
  ) {
    throw new ActionError(
      'Enter an address or select a guardian whose address the student shares',
    )
  }

  return {
    first_name: d.student_first_name,
    last_name: d.student_last_name,
    student_code: d.student_code,
    date_of_birth: d.student_date_of_birth,
    english_school_name: d.student_english_school_name,
    address_guardian_id: addressGuardianId,
    address_line_1: addressGuardianId ? null : d.student_address_line_1,
    address_line_2: addressGuardianId ? null : d.student_address_line_2,
    city: addressGuardianId ? null : d.student_city,
    postcode: addressGuardianId ? null : d.student_postcode,
    allergies: d.student_allergies,
    medical_details: d.student_medical_details,
    notes: d.student_notes,
    primary_guardian_id: primaryGuardianId,
    primary_guardian_relationship: d.primary_relationship,
    secondary_guardian_id: secondaryGuardianId,
    secondary_guardian_relationship: secondaryGuardianId
      ? (d.secondary_relationship ?? null)
      : null,
    additional_contact_1_id: contact1Id,
    additional_contact_1_relationship: contact1Id
      ? (d.contact1_relationship ?? null)
      : null,
    additional_contact_2_id: contact2Id,
    additional_contact_2_relationship: contact2Id
      ? (d.contact2_relationship ?? null)
      : null,
  }
}

/** Classes and consents are edit-only, so creating parses neither. */
export async function saveStudentAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: id === null ? 'students.create' : 'students.update',
    permission: id === null ? canCreateStudents : canEditStudents,
    formData,
    run: async (_input, { formData }) => {
      const fields = extractFormFields(formData, ['class_ids'])

      if (id === null) {
        const d = parseOrThrow(createStudentSchema, fields)
        const student = await createStudent(await studentFields(formData, d))
        return { id: student.id, details: d as Record<string, unknown> }
      }

      const d = parseOrThrow(updateStudentSchema, fields)
      await updateStudent(id, {
        ...(await studentFields(formData, d)),
        consent_privacy_notice: d.consent_privacy_notice,
        consent_emergency_first_aid: d.consent_emergency_first_aid,
        consent_photo_media: d.consent_photo_media,
        consent_home_school: d.consent_home_school,
        consent_comms_email_sms: d.consent_comms_email_sms,
      })

      const student = await getStudentById(id)
      if (student?.active) {
        await updateStudentClasses(id, d.class_ids)
      }

      return { id, details: d as Record<string, unknown> }
    },
    audit: {
      entity: 'student',
      action: id === null ? 'create' : 'update',
      entityId: (result) => result.id,
      details: (result) => result.details,
    },
    redirectTo: '/students',
    fallbackError: 'Failed to save student. Please try again.',
  })
}

export async function markStudentAsLeaverAction(
  studentId: string,
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'students.mark-leaver',
    permission: canEditStudents,
    schema: leaverSchema,
    formData,
    run: ({ reason }) => markStudentAsLeaver(studentId, reason),
    audit: {
      entity: 'student',
      action: 'update',
      entityId: () => studentId,
      details: (_result, input) => ({ leaving_reason: input.reason }),
    },
    redirectTo: '/students',
    fallbackError: 'Failed to mark student as a leaver. Please try again.',
  })
}
