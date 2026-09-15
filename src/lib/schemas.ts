import { z } from 'zod'

import { addYears, DBS_RENEWAL_YEARS } from './compliance'

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

export const registrationStatusFilter = z
  .enum(['pending', 'actioned', 'rejected', 'all'])
  .catch('pending')

export const SHORT_TEXT_MAX = 100
export const ADDRESS_TEXT_MAX = 200
export const LONG_TEXT_MAX = 2000
export const PHONE_MAX = 20
export const EMAIL_MAX = 254

const tooLong = (max: number): string => `Must be ${max} characters or fewer`

export const shortText = requiredString.max(
  SHORT_TEXT_MAX,
  tooLong(SHORT_TEXT_MAX),
)
export const optionalShortText = z
  .string()
  .trim()
  .max(SHORT_TEXT_MAX, tooLong(SHORT_TEXT_MAX))
  .transform((v) => v || null)
  .nullable()
export const optionalAddressText = z
  .string()
  .trim()
  .max(ADDRESS_TEXT_MAX, tooLong(ADDRESS_TEXT_MAX))
  .transform((v) => v || null)
  .nullable()
export const addressText = requiredString.max(
  ADDRESS_TEXT_MAX,
  tooLong(ADDRESS_TEXT_MAX),
)
export const optionalLongText = z
  .string()
  .trim()
  .max(LONG_TEXT_MAX, tooLong(LONG_TEXT_MAX))
  .transform((v) => v || null)
  .nullable()
export const boundedUkPhone = ukPhone.max(PHONE_MAX, tooLong(PHONE_MAX))
export const boundedOptionalEmail = z
  .string()
  .trim()
  .max(EMAIL_MAX, tooLong(EMAIL_MAX))
  .transform((v) => v || null)
  .nullable()
  .pipe(z.string().email('Invalid email').nullable())

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
  academic_year_id: uuid,
  teacher_id: uuid,
  student_ids: z.array(uuid).default([]),
})

// A class's academic year is fixed once it is created. Deactivation only
// happens via migration, so there is no `active` field on this form.
export const updateClassSchema = createClassSchema.omit({
  academic_year_id: true,
})

export const LEAVING_REASONS = ['left', 'graduated', 'transferred'] as const
export const leavingReason = z.enum(LEAVING_REASONS)
export const LEAVING_REASON_LABELS: Record<
  (typeof LEAVING_REASONS)[number],
  string
> = {
  left: 'Left',
  graduated: 'Graduated',
  transferred: 'Transferred',
}

export const leaverSchema = z.object({ reason: leavingReason })

export const migrationAction = z.enum(['move', 'none', ...LEAVING_REASONS])

const migrateClassBase = {
  source_class_id: uuid,
  student_actions: z.record(uuid, migrationAction),
}

export const migrateClassSchema = z.discriminatedUnion('create_new_class', [
  z.object({
    create_new_class: z.literal('true'),
    ...migrateClassBase,
    name: requiredString,
    year_group: requiredString,
    room_number: optionalString,
    academic_year_id: uuid,
    teacher_id: uuid,
  }),
  z
    .object({
      create_new_class: z.literal('false'),
      ...migrateClassBase,
    })
    .refine((d) => !Object.values(d.student_actions).includes('move'), {
      message: 'Students can only move when a new class is created',
      path: ['student_actions'],
    }),
])

export const updateGuardianSchema = z.object({
  first_name: requiredString,
  last_name: requiredString,
  phone: ukPhone,
  email: optionalEmail,
  // Optional here: this page edits a guardian in isolation and cannot tell
  // whether they are a parent or an emergency contact — that role lives on the
  // student→guardian link, and one person can be both.
  occupation: optionalShortText,
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
  title: shortText,
  first_name: requiredString,
  last_name: requiredString,
  email: emailField,
  role: staffRole,
  display_name: optionalString,
  contact_number: optionalUkPhone,
  personal_email: optionalEmail,
})

export const updateStaffSchema = createStaffSchema

const guardianNewBase = z.object({
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

// Occupation is required of parents/carers but not of emergency contacts, so
// the caller picks the variant matching the slot being filled. Only the 'new'
// branch carries it — reusing an existing guardian never re-collects details.
const guardianNewSchema = guardianNewBase.extend({
  occupation: optionalShortText.optional(),
})

const guardianNewWithOccupationSchema = guardianNewBase.extend({
  occupation: shortText,
})

/** Emergency contact slots — occupation optional. */
export const guardianSchema = z.discriminatedUnion('mode', [
  guardianNewSchema,
  guardianExistingSchema,
])

/** Primary and secondary parent/carer slots — occupation required. */
export const guardianSchemaWithOccupation = z.discriminatedUnion('mode', [
  guardianNewWithOccupationSchema,
  guardianExistingSchema,
])

const studentBaseSchema = z
  .object({
    student_first_name: requiredString,
    student_last_name: requiredString,
    student_code: optionalString,
    student_date_of_birth: optionalString,
    // Optional for admin data entry: there is a backlog of existing students
    // whose English school is unknown. Required on the public form.
    student_english_school_name: optionalShortText,
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

const registrationContactBase = z.object({
  first_name: shortText,
  last_name: shortText,
  relationship: optionalShortText,
  phone: boundedUkPhone, // guardians.phone is NOT NULL
  email: boundedOptionalEmail,
  same_as_child_address: checkbox,
  address_line_1: optionalAddressText,
  address_line_2: optionalAddressText,
  city: optionalAddressText,
  postcode: optionalAddressText,
})

/** Emergency contact blocks — occupation optional. */
export const registrationContactSchema = registrationContactBase.extend({
  occupation: optionalShortText,
})

/** Primary and secondary parent/carer blocks — occupation required. */
export const registrationParentContactSchema = registrationContactBase.extend({
  occupation: shortText,
})

export const registrationSubmissionSchema = z.object({
  child_first_name: shortText,
  child_last_name: shortText,
  date_of_birth: isoDate,
  preferred_year_group: optionalShortText,
  english_school_name: shortText,
  address_line_1: addressText, // NOT NULL in the table; makes students_address_source_check satisfiable
  address_line_2: optionalAddressText,
  city: addressText,
  postcode: addressText,
  allergies: optionalLongText,
  medical_details: optionalLongText,
  // Only rendered on the form once an emergency contact is added.
  collect_authorised: optionalLongText.optional(),
  collect_password: optionalLongText.optional(),
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
  declaration_name: shortText,
  turnstile_token: requiredString.max(2048),
})

export const approveRegistrationSchema = z.object({
  student_code: optionalString,
  class_id: optionalString.pipe(uuid.nullable()),
  existing_student_id: optionalString.pipe(uuid.nullable()),
  reuse_guardians: checkbox,
})

export const rejectRegistrationSchema = z.object({ reason: requiredString })

// ─── Photo consent opt-out ────────────────────────────────────────────────────

export const photoOptOutSchema = z.object({
  child_first_name: shortText,
  child_last_name: shortText,
  date_of_birth: isoDate,
  declaration_name: shortText,
  notes: optionalLongText,
  turnstile_token: requiredString.max(2048),
})

export const applyPhotoOptOutSchema = z.object({
  student_id: uuid,
})

export const rejectPhotoOptOutSchema = z.object({ reason: requiredString })

// ─── Finance ─────────────────────────────────────────────────────────────────
// Enum values mirror the CHECK constraints in the finance_payments migration.

export const paymentFunding = z.enum(['kea', 'school'], {
  message: 'Select how this staff member is paid',
})
export const idType = z.enum([
  'passport',
  'driving_licence',
  'brp',
  'birth_certificate',
  'other',
])
export const dbsLevel = z.enum(['enhanced', 'standard', 'basic'])
export const paymentPlan = z.enum(['monthly', 'termly', 'yearly', 'custom'])
export const paymentMethod = z.enum(['bank_transfer', 'cash', 'card', 'other'])

const optionalIsoDate = optionalString.pipe(isoDate.nullable())

// Sort codes and account numbers are often typed with dashes or spaces.
const digitsOrNull = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, '') || null)
  .nullable()

export const optionalSortCode = digitsOrNull.pipe(
  z
    .string()
    .regex(/^\d{6}$/, 'Sort code must be 6 digits')
    .nullable(),
)

export const optionalAccountNumber = digitsOrNull.pipe(
  z
    .string()
    .regex(/^\d{8}$/, 'Account number must be 8 digits')
    .nullable(),
)

const MONEY_PATTERN = /^\d{1,8}(\.\d{1,2})?$/
const MONEY_MESSAGE = 'Enter an amount like 100 or 99.50'

export const moneyAmount = requiredString
  .regex(MONEY_PATTERN, MONEY_MESSAGE)
  .transform(Number)

export const optionalMoneyAmount = optionalString.pipe(
  z.string().regex(MONEY_PATTERN, MONEY_MESSAGE).transform(Number).nullable(),
)

const academicYearCode = requiredString
  .transform((v) => v.replace('/', '-'))
  .pipe(
    z.string().regex(/^\d{4}-\d{2}$/, 'Academic year must look like 2025-26'),
  )
  .refine(
    (v) => (Number(v.slice(0, 4)) + 1) % 100 === Number(v.slice(5)),
    'Academic year must be two consecutive years, like 2025-26',
  )

export const academicYearDatesSchema = z
  .object({
    start_date: isoDate,
    end_date: isoDate,
  })
  .refine((d) => d.end_date > d.start_date, {
    message: 'End date must be after the start date',
    path: ['end_date'],
  })

export const academicYearSchema = z
  .object({
    code: academicYearCode,
    start_date: isoDate,
    end_date: isoDate,
  })
  .refine((d) => d.end_date > d.start_date, {
    message: 'End date must be after the start date',
    path: ['end_date'],
  })

type RequiredDetail = [value: unknown, path: string, message: string]

function requireDetails(
  ctx: z.RefinementCtx,
  when: boolean,
  details: RequiredDetail[],
): void {
  if (!when) return
  for (const [value, path, message] of details) {
    if (value === null || value === undefined) {
      ctx.addIssue({ code: 'custom', message, path: [path] })
    }
  }
}

export const staffPayrollSchema = z
  .object({
    payment_funding: paymentFunding,
    bank_account_name: optionalShortText,
    bank_sort_code: optionalSortCode,
    bank_account_number: optionalAccountNumber,
    payroll_ref: optionalShortText,
    id_verified: checkbox,
    id_type: optionalString.pipe(idType.nullable()),
    id_verified_at: optionalIsoDate,
    right_to_work_checked: checkbox,
    right_to_work_checked_at: optionalIsoDate,
    dbs_verified: checkbox,
    dbs_level: optionalString.pipe(dbsLevel.nullable()),
    dbs_barred_list_checked: checkbox,
    dbs_update_service: checkbox,
    dbs_reference: optionalShortText,
    dbs_issue_date: optionalIsoDate,
    dbs_verified_at: optionalIsoDate,
    dbs_renewal_due: optionalIsoDate,
    first_aid_certified: checkbox,
    first_aid_reference: optionalShortText,
    first_aid_issue_date: optionalIsoDate,
    first_aid_verified_at: optionalIsoDate,
    first_aid_expiry_date: optionalIsoDate,
    fire_warden_certified: checkbox,
    fire_warden_reference: optionalShortText,
    fire_warden_issue_date: optionalIsoDate,
    fire_warden_verified_at: optionalIsoDate,
    fire_warden_expiry_date: optionalIsoDate,
  })
  .superRefine((d, ctx) => {
    const hasAnyBank = Boolean(
      d.bank_account_name || d.bank_sort_code || d.bank_account_number,
    )
    requireDetails(ctx, hasAnyBank, [
      [
        d.bank_account_name,
        'bank_account_name',
        'Enter the account holder name',
      ],
      [d.bank_sort_code, 'bank_sort_code', 'Enter the sort code'],
      [
        d.bank_account_number,
        'bank_account_number',
        'Enter the account number',
      ],
    ])
    requireDetails(ctx, d.id_verified, [
      [d.id_type, 'id_type', 'Select the ID type that was verified'],
      [d.id_verified_at, 'id_verified_at', 'Enter the ID verification date'],
    ])
    requireDetails(ctx, d.right_to_work_checked, [
      [
        d.right_to_work_checked_at,
        'right_to_work_checked_at',
        'Enter the right to work check date',
      ],
    ])
    requireDetails(ctx, d.dbs_verified, [
      [d.dbs_level, 'dbs_level', 'Select the DBS level'],
      [d.dbs_reference, 'dbs_reference', 'Enter the DBS certificate reference'],
      [d.dbs_issue_date, 'dbs_issue_date', 'Enter the DBS issue date'],
      [d.dbs_verified_at, 'dbs_verified_at', 'Enter the DBS verification date'],
    ])
    requireDetails(ctx, d.first_aid_certified, [
      [
        d.first_aid_reference,
        'first_aid_reference',
        'Enter the first aid certificate reference',
      ],
      [
        d.first_aid_issue_date,
        'first_aid_issue_date',
        'Enter the first aid issue date',
      ],
      [
        d.first_aid_verified_at,
        'first_aid_verified_at',
        'Enter the first aid verification date',
      ],
    ])
    requireDetails(ctx, d.fire_warden_certified, [
      [
        d.fire_warden_reference,
        'fire_warden_reference',
        'Enter the fire warden certificate reference',
      ],
      [
        d.fire_warden_issue_date,
        'fire_warden_issue_date',
        'Enter the fire warden issue date',
      ],
      [
        d.fire_warden_verified_at,
        'fire_warden_verified_at',
        'Enter the fire warden verification date',
      ],
    ])
  })
  .transform((d) => ({
    ...d,
    dbs_renewal_due:
      d.dbs_renewal_due ??
      (d.dbs_issue_date ? addYears(d.dbs_issue_date, DBS_RENEWAL_YEARS) : null),
  }))

export const feePlanSchema = z.object({
  name: shortText,
  academic_year_id: uuid,
  full_year_amount: moneyAmount,
  monthly_instalment_amount: moneyAmount,
  termly_instalment_amount: moneyAmount,
  notes: optionalLongText,
  active: checkbox,
  class_ids: z.array(uuid).default([]),
})

export const studentFeeAccountSchema = z
  .object({
    academic_year_id: uuid,
    payment_plan: optionalString.pipe(paymentPlan.nullable()),
    payment_plan_notes: optionalLongText,
    fee_plan_override_id: optionalString.pipe(uuid.nullable()),
    custom_total_amount: optionalMoneyAmount,
    custom_up_to_date: checkbox,
    settled: checkbox,
    settled_note: optionalLongText,
  })
  .superRefine((d, ctx) => {
    requireDetails(ctx, d.payment_plan === 'custom', [
      [
        d.custom_total_amount,
        'custom_total_amount',
        'Enter the agreed total for a custom plan',
      ],
      [
        d.payment_plan_notes,
        'payment_plan_notes',
        'Explain the custom arrangement in the notes',
      ],
    ])
  })
  .transform((d) =>
    d.payment_plan === 'custom'
      ? d
      : { ...d, custom_total_amount: null, custom_up_to_date: false },
  )

export const studentPaymentSchema = z.object({
  amount: moneyAmount.refine((n) => n > 0, 'Amount must be more than £0'),
  payment_date: isoDate,
  academic_year_id: uuid,
  reference: shortText,
  method: paymentMethod,
  notes: optionalLongText,
})

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
    occupation: (formData.get(`${prefix}_occupation`) as string) ?? undefined,
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
    occupation: (formData.get(`${prefix}_occupation`) as string) ?? '',
    same_as_child_address:
      (formData.get(`${prefix}_same_as_child_address`) as string | null) ??
      undefined,
    address_line_1: (formData.get(`${prefix}_address_line_1`) as string) ?? '',
    address_line_2: (formData.get(`${prefix}_address_line_2`) as string) ?? '',
    city: (formData.get(`${prefix}_city`) as string) ?? '',
    postcode: (formData.get(`${prefix}_postcode`) as string) ?? '',
  }
}
