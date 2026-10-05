'use server'

import type { z } from 'zod'

import {
  getGuardianById,
  getStudentById,
  markStudentAsLeaver,
  saveStudent,
  StudentChangedError,
  updateStudentClasses,
  withdrawPhotoVideoConsent,
} from '@/db'
import {
  ActionError,
  parseOrThrow,
  runAction,
  type ActionResult,
} from '@/lib/action'
import { isOldEnoughToLeaveAlone } from '@/lib/consents'
import { parseGuardianSlot, toGuardianSlot } from '@/lib/guardians/guardianSlot'
import { canCreateStudents, canEditStudents } from '@/lib/permissions'
import {
  assertStudentCodeFree,
  guardStudentCode,
} from '@/lib/student-code-check'
import {
  createStudentSchema,
  updateStudentSchema,
  guardianSchema,
  guardianSchemaWithOccupation,
  leaverSchema,
  extractFormFields,
} from '@/lib/schemas'

/**
 * The student shares the primary guardian's address, so that guardian must have
 * one. A guardian being created carries its address in the form; an existing
 * one is read back from its row.
 */
async function assertGuardianHasAddress(
  guardian: z.infer<typeof guardianSchema>,
): Promise<void> {
  const address =
    guardian.mode === 'existing'
      ? await getGuardianById(guardian.existing_id)
      : guardian

  if (!address?.address_line_1 || !address.city || !address.postcode)
    throw new ActionError(
      'The selected guardian does not have an address. Add their address first.',
    )
}

type SaveStudentArgs = Parameters<typeof saveStudent>

/**
 * What both creating and editing save: the student's own details, the
 * guardians to link (any entered as new are created by `saveStudent`, in the
 * same transaction as the student) and the address source. The code and every
 * guardian block are checked first, so a form with several mistakes is
 * refused before anything is written.
 */
async function parseStudentForm(
  formData: FormData,
  d: z.infer<typeof createStudentSchema>,
  id: string | null,
): Promise<{
  data: SaveStudentArgs[1]
  slots: SaveStudentArgs[2]
  addressFromPrimary: boolean
}> {
  await assertStudentCodeFree(d.student_code, id)

  const primary = parseGuardianSlot(
    formData,
    'primary',
    guardianSchemaWithOccupation,
  )

  const secondary = d.has_secondary
    ? parseGuardianSlot(formData, 'secondary', guardianSchemaWithOccupation)
    : null

  const contact1 = d.has_contact1
    ? parseGuardianSlot(formData, 'contact1', guardianSchema)
    : null

  const contact2 = d.has_contact2
    ? parseGuardianSlot(formData, 'contact2', guardianSchema)
    : null

  const sharesPrimaryAddress = d.address_guardian_id === 'primary'

  if (sharesPrimaryAddress) {
    await assertGuardianHasAddress(primary)
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
    data: {
      first_name: d.student_first_name,
      last_name: d.student_last_name,
      student_code: d.student_code,
      date_of_birth: d.student_date_of_birth,
      english_school_name: d.student_english_school_name,
      address_line_1: sharesPrimaryAddress ? null : d.student_address_line_1,
      address_line_2: sharesPrimaryAddress ? null : d.student_address_line_2,
      city: sharesPrimaryAddress ? null : d.student_city,
      postcode: sharesPrimaryAddress ? null : d.student_postcode,
      allergies: d.student_allergies,
      medical_details: d.student_medical_details,
      sen_details: d.student_sen_details,
      notes: d.student_notes,
      primary_guardian_relationship: d.primary_relationship,
      secondary_guardian_relationship: secondary
        ? (d.secondary_relationship ?? null)
        : null,
      additional_contact_1_relationship: contact1
        ? (d.contact1_relationship ?? null)
        : null,
      additional_contact_2_relationship: contact2
        ? (d.contact2_relationship ?? null)
        : null,
    },
    slots: {
      primary: toGuardianSlot(primary),
      secondary: secondary && toGuardianSlot(secondary),
      contact1: contact1 && toGuardianSlot(contact1),
      contact2: contact2 && toGuardianSlot(contact2),
    },
    addressFromPrimary: sharesPrimaryAddress,
  }
}

/** Classes and consents are edit-only, so creating parses neither. */
export async function saveStudentAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  const isCreate = id === null

  return runAction({
    name: isCreate ? 'students.create' : 'students.update',
    permission: isCreate ? canCreateStudents : canEditStudents,
    formData,
    run: async (_input, { formData, actor }) => {
      const fields = extractFormFields(formData, ['class_ids'])

      if (isCreate) {
        const d = parseOrThrow(createStudentSchema, fields)
        const { data, slots, addressFromPrimary } = await parseStudentForm(
          formData,
          d,
          null,
        )
        const student = await guardStudentCode(
          d.student_code,
          saveStudent(null, data, slots, addressFromPrimary),
        )
        return { id: student.id, details: d as Record<string, unknown> }
      }

      const d = parseOrThrow(updateStudentSchema, fields)
      const { data, slots, addressFromPrimary } = await parseStudentForm(
        formData,
        d,
        id,
      )
      try {
        await guardStudentCode(
          d.student_code,
          saveStudent(
            id,
            {
              ...data,
              privacy_notice_read: d.privacy_notice_read,
              first_aid_consent: d.first_aid_consent,
              photo_video_consent: d.photo_video_consent,
              home_school_agreement: d.home_school_agreement,
              email_sms_contact_ack: d.email_sms_contact_ack,
              may_leave_unaccompanied:
                isOldEnoughToLeaveAlone(d.student_date_of_birth) &&
                d.may_leave_unaccompanied,
            },
            slots,
            addressFromPrimary,
            { savedBy: actor.staffId, loadedAt: d.updated_at },
          ),
        )
      } catch (err) {
        if (err instanceof StudentChangedError)
          throw new ActionError(err.message)
        throw err
      }

      const student = await getStudentById(id)
      if (student?.active) {
        await updateStudentClasses(id, d.class_ids)
      }

      return { id, details: d as Record<string, unknown> }
    },
    audit: {
      entity: 'student',
      action: isCreate ? 'create' : 'update',
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

/**
 * A parent has withdrawn photo/video consent: turns it off on the student and
 * records who did so and when, then reloads the student's page.
 */
export async function withdrawPhotoVideoConsentAction(
  studentId: string,
): Promise<ActionResult> {
  return runAction({
    name: 'students.withdraw-photo-consent',
    permission: canEditStudents,
    formData: new FormData(),
    run: (_input, { actor }) =>
      withdrawPhotoVideoConsent(studentId, actor.staffId),
    audit: {
      entity: 'student',
      action: 'update',
      entityId: () => studentId,
      details: () => ({ photo_video_consent: false }),
    },
    redirectTo: `/students/${studentId}`,
    fallbackError: 'Failed to withdraw photo consent. Please try again.',
  })
}
