'use server'

import type { z } from 'zod'

import { createGuardian, createStudent, getGuardianById } from '@/db'
import { ActionError, runAction, type ActionResult } from '@/lib/action'
import { canCreateStudents } from '@/lib/permissions'
import {
  createStudentSchema,
  guardianSchema,
  guardianSchemaWithOccupation,
  extractFormFields,
  extractGuardianFields,
} from '@/lib/schemas'

async function resolveGuardian(
  guardian: z.infer<typeof guardianSchema>,
): Promise<string> {
  if (guardian.mode === 'existing') return guardian.existing_id

  const { mode: _, ...data } = guardian
  const created = await createGuardian({
    first_name: data.first_name,
    last_name: data.last_name,
    phone: data.phone,
    email: data.email ?? undefined,
    occupation: data.occupation ?? undefined,
    address_line_1: data.address_line_1 ?? undefined,
    address_line_2: data.address_line_2 ?? undefined,
    city: data.city ?? undefined,
    postcode: data.postcode ?? undefined,
  })
  return created.id
}

/**
 * Guardians live in four prefixed blocks of the same form, so they are parsed
 * here rather than through `runAction`'s single `schema`.
 */
async function resolveGuardianSlot(
  formData: FormData,
  prefix: string,
  schema: typeof guardianSchema | typeof guardianSchemaWithOccupation,
): Promise<string> {
  const parsed = schema.safeParse(extractGuardianFields(formData, prefix))
  if (!parsed.success) throw new ActionError(parsed.error.issues[0].message)
  return resolveGuardian(parsed.data)
}

export async function createStudentAction(
  formData: FormData,
): Promise<ActionResult> {
  return runAction({
    name: 'students.create',
    permission: canCreateStudents,
    formData,
    run: async (_input, { formData }) => {
      const parsed = createStudentSchema.safeParse(extractFormFields(formData))
      if (!parsed.success) throw new ActionError(parsed.error.issues[0].message)
      const d = parsed.data

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

      const student = await createStudent({
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
      })

      return { id: student.id, details: d as Record<string, unknown> }
    },
    audit: {
      entity: 'student',
      action: 'create',
      entityId: (result) => result.id,
      details: (result) => result.details,
    },
    revalidate: ['/students'],
    redirectTo: '/students',
    fallbackError: 'Failed to save student. Please try again.',
  })
}
