import { z } from 'zod'

// ─── Reusable field schemas ──────────────────────────────────────────────────

export const uuid = z.string().uuid()

export const requiredString = z.string().trim().min(1, 'Required')

export const optionalString = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

export const isoDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'Invalid datetime')

export const isoTime = z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time')

export const ukPhone = z
  .string()
  .trim()
  .min(7, 'Phone number is too short')
  .regex(/^[\d\s\-+()]+$/, 'Invalid phone number')

export const optionalUkPhone = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .pipe(
    z
      .string()
      .regex(/^[\d\s\-+()]+$/, 'Invalid phone number')
      .nullable(),
  )

export const emailField = z.string().trim().email('Invalid email')

export const optionalEmail = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .pipe(z.string().email('Invalid email').nullable())

export const staffRole = z.enum([
  'teacher',
  'admin',
  'headteacher',
  'secretary',
])

export const incidentType = z.enum(['medical', 'behaviour', 'other'])

export const attendanceStatus = z.enum(['present', 'absent', 'late'])

export const booleanFromString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')

// Unticked checkboxes are absent from FormData; ticked ones send "on".
export const checkbox = z
  .string()
  .optional()
  .transform((v) => v === 'on' || v === 'true')

export const requiredCheckbox = (message: string) =>
  checkbox.refine((v) => v, message)

export const submissionStatus = z.enum(['pending', 'actioned', 'rejected'])

// ─── Domain schemas ──────────────────────────────────────────────────────────

export const saveAttendanceSchema = z.object({
  classId: uuid,
  date: isoDate,
  studentIds: z.array(uuid).min(1, 'At least one student is required'),
  records: z.array(
    z.object({
      studentId: uuid,
      status: attendanceStatus,
      notes: optionalString,
    }),
  ),
})

export const createClassSchema = z.object({
  name: requiredString,
  year_group: requiredString,
  room_number: optionalString,
  academic_year: optionalString,
  teacher_id: uuid,
  student_ids: z.array(uuid).default([]),
})

export const updateClassSchema = createClassSchema.extend({
  active: booleanFromString,
})

export const migrateClassSchema = z.object({
  source_class_id: uuid,
  name: requiredString,
  year_group: requiredString,
  room_number: optionalString,
  academic_year: requiredString,
  teacher_id: uuid,
})

export const updateGuardianSchema = z.object({
  first_name: requiredString,
  last_name: requiredString,
  phone: ukPhone,
  email: optionalEmail,
  address_line_1: optionalString,
  address_line_2: optionalString,
  city: optionalString,
  postcode: optionalString,
  notes: optionalString,
})

export const createIncidentSchema = z.object({
  type: incidentType,
  student_id: uuid,
  title: requiredString,
  description: requiredString,
  incident_date: isoDateTime,
  parent_notified: booleanFromString,
  parent_notified_at: z
    .string()
    .trim()
    .transform((v) => v || null)
    .nullable(),
})

export const updateIncidentSchema = createIncidentSchema.omit({
  student_id: true,
})

export const createLessonPlanSchema = z.object({
  class_id: uuid,
  lesson_date: isoDate,
  description: requiredString.pipe(
    z.string().max(300, 'Description must be 300 characters or less'),
  ),
})

export const updateLessonPlanSchema = z.object({
  lesson_date: isoDate,
  description: requiredString.pipe(
    z.string().max(300, 'Description must be 300 characters or less'),
  ),
})

export const staffAttendanceSchema = z.object({
  staffId: uuid,
  date: isoDate,
  time: isoTime,
})

export const createStaffSchema = z.object({
  first_name: requiredString,
  last_name: requiredString,
  email: emailField,
  role: staffRole,
  display_name: optionalString,
  contact_number: optionalUkPhone,
  personal_email: optionalEmail,
})

export const updateStaffSchema = createStaffSchema

const guardianNewSchema = z.object({
  mode: z.literal('new'),
  first_name: requiredString,
  last_name: requiredString,
  phone: ukPhone,
  email: optionalEmail.optional(),
  address_line_1: optionalString.optional(),
  address_line_2: optionalString.optional(),
  city: optionalString.optional(),
  postcode: optionalString.optional(),
})

const guardianExistingSchema = z.object({
  mode: z.literal('existing'),
  existing_id: uuid,
})

export const guardianSchema = z.discriminatedUnion('mode', [
  guardianNewSchema,
  guardianExistingSchema,
])

const studentBaseSchema = z
  .object({
    student_first_name: requiredString,
    student_last_name: requiredString,
    student_code: optionalString,
    student_date_of_birth: optionalString,
    address_guardian_id: optionalString,
    student_address_line_1: optionalString.optional(),
    student_address_line_2: optionalString.optional(),
    student_city: optionalString.optional(),
    student_postcode: optionalString.optional(),
    student_allergies: optionalString,
    student_medical_details: optionalString,
    student_notes: optionalString,
    primary_relationship: optionalString,
    has_secondary: booleanFromString,
    secondary_relationship: optionalString.optional(),
    has_contact1: booleanFromString,
    contact1_relationship: optionalString.optional(),
    has_contact2: booleanFromString,
    contact2_relationship: optionalString.optional(),
  })
  .superRefine((data, ctx) => {
    const hasGuardianRef = data.address_guardian_id != null
    const hasOwnAddress = Boolean(
      data.student_address_line_1 && data.student_city && data.student_postcode,
    )
    if (!hasGuardianRef && !hasOwnAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Enter an address or select a guardian whose address the student shares',
        path: [],
      })
    }
  })

export const createStudentSchema = studentBaseSchema

export const updateStudentSchema = studentBaseSchema.extend({
  class_ids: z.array(uuid).default([]),
  consent_privacy_notice: checkbox,
  consent_emergency_first_aid: checkbox,
  consent_photo_media: checkbox,
  consent_home_school: checkbox,
  consent_comms_email_sms: checkbox,
})

export const registrationContactSchema = z.object({
  first_name: requiredString,
  last_name: requiredString,
  relationship: optionalString,
  phone: ukPhone, // guardians.phone is NOT NULL
  email: optionalEmail,
  same_as_child_address: checkbox,
  address_line_1: optionalString,
  address_line_2: optionalString,
  city: optionalString,
  postcode: optionalString,
})

export const registrationSubmissionSchema = z.object({
  child_first_name: requiredString,
  child_last_name: requiredString,
  date_of_birth: isoDate,
  preferred_year_group: optionalString,
  address_line_1: requiredString, // NOT NULL in the table; makes students_address_source_check satisfiable
  address_line_2: optionalString,
  city: requiredString,
  postcode: requiredString,
  allergies: optionalString,
  medical_details: optionalString,
  // Only rendered on the form once an emergency contact is added.
  collect_authorised: optionalString.optional(),
  collect_password: optionalString.optional(),
  has_secondary: booleanFromString,
  has_contact1: booleanFromString,
  has_contact2: booleanFromString,
  consent_privacy_notice: requiredCheckbox(
    'You must accept the privacy notice',
  ),
  consent_emergency_first_aid: requiredCheckbox(
    'Emergency first aid consent is required',
  ),
  consent_photo_media: checkbox,
  consent_home_school: checkbox,
  consent_comms_email_sms: checkbox,
  declaration_name: requiredString,
  turnstile_token: requiredString,
})

export const approveRegistrationSchema = z.object({
  student_code: optionalString,
  class_id: optionalString.pipe(uuid.nullable()),
  existing_student_id: optionalString.pipe(uuid.nullable()),
})

export const rejectRegistrationSchema = z.object({ reason: requiredString })

// ─── Helpers ─────────────────────────────────────────────────────────────────

export type ActionResult = { error: string } | void

export function extractFormFields(
  formData: FormData,
  arrayFields: string[] = [],
): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (arrayFields.includes(key)) {
      const arr = obj[key]
      if (Array.isArray(arr)) {
        arr.push(value)
      } else {
        obj[key] = [value]
      }
    } else {
      obj[key] = value
    }
  }
  return obj
}

export function extractGuardianFields(
  formData: FormData,
  prefix: string,
): z.infer<typeof guardianSchema> {
  const mode = formData.get(`${prefix}_mode`) as string
  if (mode === 'existing') {
    return {
      mode: 'existing',
      existing_id: formData.get(`${prefix}_existing_id`) as string,
    }
  }
  return {
    mode: 'new',
    first_name: (formData.get(`${prefix}_first_name`) as string) ?? '',
    last_name: (formData.get(`${prefix}_last_name`) as string) ?? '',
    phone: (formData.get(`${prefix}_phone`) as string) ?? '',
    email: (formData.get(`${prefix}_email`) as string) ?? undefined,
    address_line_1:
      (formData.get(`${prefix}_address_line_1`) as string) ?? undefined,
    address_line_2:
      (formData.get(`${prefix}_address_line_2`) as string) ?? undefined,
    city: (formData.get(`${prefix}_city`) as string) ?? undefined,
    postcode: (formData.get(`${prefix}_postcode`) as string) ?? undefined,
  }
}

// Mirrors extractGuardianFields: reads `${prefix}_first_name` … `${prefix}_postcode`
export function extractRegistrationContact(
  formData: FormData,
  prefix: string,
): Record<string, unknown> {
  return {
    first_name: (formData.get(`${prefix}_first_name`) as string) ?? '',
    last_name: (formData.get(`${prefix}_last_name`) as string) ?? '',
    relationship: (formData.get(`${prefix}_relationship`) as string) ?? '',
    phone: (formData.get(`${prefix}_phone`) as string) ?? '',
    email: (formData.get(`${prefix}_email`) as string) ?? '',
    same_as_child_address:
      (formData.get(`${prefix}_same_as_child_address`) as string | null) ??
      undefined,
    address_line_1: (formData.get(`${prefix}_address_line_1`) as string) ?? '',
    address_line_2: (formData.get(`${prefix}_address_line_2`) as string) ?? '',
    city: (formData.get(`${prefix}_city`) as string) ?? '',
    postcode: (formData.get(`${prefix}_postcode`) as string) ?? '',
  }
}
