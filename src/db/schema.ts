/**
 * The database schema, as code. Source of truth for `drizzle-kit generate`
 * (see drizzle.config.ts) and for every row type in `src/db`.
 *
 * Column names stay snake_case in Postgres; TS properties are camelCase via
 * `casing: 'snake_case'`. Columns whose snake_case name has a digit segment
 * (`address_line_1`) are named explicitly, because Drizzle's casing would
 * produce `address_line1`. Constraint, index and FK names are explicit so they
 * match the names already in production.
 *
 * Every table calls `.enableRLS()` with no policies (src/db/schema.spec.ts
 * enforces it). The app connects as `postgres`, which bypasses RLS; RLS is
 * there to deny Supabase's public Data API, whose roles also hold no grants.
 *
 * Not modelled here: the `academic_years_no_overlap` EXCLUDE constraint
 * (Drizzle has no API for exclusion constraints), which stays in
 * supabase/migrations. There are no database functions or triggers: behaviour
 * is TypeScript in src/db.
 */
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { timestamptz } from './timestamptz'

const money = () => numeric({ precision: 10, scale: 2, mode: 'number' })

/** `updatedAt` on every Drizzle update and upsert (was the set_updated_at trigger). */
const stamp = (): string => new Date().toISOString()

// ─── Enums ──────────────────────────────────────────────────────────────────

export const contactRole = pgEnum('contact_role', [
  'primary',
  'secondary',
  'additional_1',
  'additional_2',
])

export const photoOptOutStatus = pgEnum('photo_opt_out_status', [
  'pending',
  'actioned',
  'rejected',
])

export const submissionStatus = pgEnum('submission_status', [
  'pending',
  'actioned',
  'rejected',
])

// ─── Tables ─────────────────────────────────────────────────────────────────

export const academicYears = pgTable(
  'academic_years',
  {
    id: uuid().defaultRandom().primaryKey(),
    code: text().notNull(),
    startDate: date().notNull(),
    endDate: date().notNull(),
    isCurrent: boolean().default(false).notNull(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamptz()
      .default(sql`now()`)
      .notNull()
      .$onUpdate(stamp),
  },
  (t) => [
    unique('academic_years_code_key').on(t.code),
    uniqueIndex('academic_years_one_current')
      .using('btree', t.isCurrent)
      .where(sql`${t.isCurrent}`),
    check('academic_years_code_check', sql`${t.code} ~ '^\\d{4}-\\d{2}$'`),
    check('academic_years_end_date_check', sql`${t.endDate} > ${t.startDate}`),
  ],
).enableRLS()

export const staff = pgTable(
  'staff',
  {
    id: uuid().defaultRandom().primaryKey(),
    email: text().notNull(),
    role: text().notNull(),
    contactNumber: text(),
    createdAt: timestamptz().default(sql`now()`),
    firstName: text().notNull(),
    lastName: text().notNull(),
    displayName: text(),
    personalEmail: text(),
    title: text().default('Ms').notNull(),
  },
  (t) => [
    unique('staff_email_key').on(t.email),
    check(
      'staff_role_check',
      sql`${t.role} = ANY (ARRAY['teacher'::text, 'admin'::text, 'headteacher'::text, 'secretary'::text])`,
    ),
  ],
).enableRLS()

export const guardians = pgTable(
  'guardians',
  {
    id: uuid().defaultRandom().primaryKey(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    phone: text().notNull(),
    email: text(),
    addressLine1: text('address_line_1'),
    addressLine2: text('address_line_2'),
    city: text(),
    postcode: text(),
    notes: text(),
    createdAt: timestamptz().default(sql`now()`),
    updatedAt: timestamptz()
      .default(sql`now()`)
      .$onUpdate(stamp),
    occupation: text(),
  },
  (t) => [
    index('guardians_email_lower_idx').using('btree', sql`lower(${t.email})`),
    index('guardians_last_name_idx').using('btree', t.lastName),
  ],
).enableRLS()

export const students = pgTable(
  'students',
  {
    id: uuid().defaultRandom().primaryKey(),
    studentCode: text(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    dateOfBirth: date(),
    allergies: text(),
    enrollmentDate: date().default(sql`CURRENT_DATE`),
    active: boolean().default(true).notNull(),
    notes: text(),
    createdAt: timestamptz().default(sql`now()`),
    updatedAt: timestamptz()
      .default(sql`now()`)
      .$onUpdate(stamp),
    addressLine1: text('address_line_1'),
    addressLine2: text('address_line_2'),
    city: text(),
    postcode: text(),
    primaryGuardianId: uuid().notNull(),
    secondaryGuardianId: uuid(),
    additionalContact1Id: uuid('additional_contact_1_id'),
    additionalContact2Id: uuid('additional_contact_2_id'),
    primaryGuardianRelationship: text(),
    secondaryGuardianRelationship: text(),
    additionalContact1Relationship: text('additional_contact_1_relationship'),
    additionalContact2Relationship: text('additional_contact_2_relationship'),
    medicalDetails: text(),
    addressGuardianId: uuid(),
    privacyNoticeRead: boolean().default(false).notNull(),
    firstAidConsent: boolean().default(false).notNull(),
    photoVideoConsent: boolean().default(false).notNull(),
    homeSchoolAgreement: boolean().default(false).notNull(),
    emailSmsContactAck: boolean().default(false).notNull(),
    englishSchoolName: text(),
    leavingReason: text(),
    senDetails: text(),
    // True only when the parent has said so; offered from age 12.
    mayLeaveUnaccompanied: boolean().default(false).notNull(),
    // When the parent gave the consents above, and which Privacy Notice they
    // read. Null on records from before versions were tracked.
    consentsRecordedAt: timestamptz(),
    privacyNoticeVersion: text(),
    // Set when photo/video consent is withdrawn; cleared if it is given again.
    photoVideoConsentWithdrawnAt: timestamptz(),
    photoVideoConsentWithdrawnBy: uuid(),
  },
  (t) => [
    unique('students_student_code_key').on(t.studentCode),
    index('students_active_idx').using('btree', t.active),
    index('students_additional_contact_1_id_idx').using(
      'btree',
      t.additionalContact1Id,
    ),
    index('students_additional_contact_2_id_idx').using(
      'btree',
      t.additionalContact2Id,
    ),
    index('students_primary_guardian_id_idx').using(
      'btree',
      t.primaryGuardianId,
    ),
    index('students_secondary_guardian_id_idx').using(
      'btree',
      t.secondaryGuardianId,
    ),
    index('students_student_code_idx').using('btree', t.studentCode),
    foreignKey({
      name: 'students_primary_guardian_id_fkey',
      columns: [t.primaryGuardianId],
      foreignColumns: [guardians.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'students_secondary_guardian_id_fkey',
      columns: [t.secondaryGuardianId],
      foreignColumns: [guardians.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'students_additional_contact_1_id_fkey',
      columns: [t.additionalContact1Id],
      foreignColumns: [guardians.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'students_additional_contact_2_id_fkey',
      columns: [t.additionalContact2Id],
      foreignColumns: [guardians.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'students_address_guardian_id_fkey',
      columns: [t.addressGuardianId],
      foreignColumns: [guardians.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'students_photo_video_consent_withdrawn_by_fkey',
      columns: [t.photoVideoConsentWithdrawnBy],
      foreignColumns: [staff.id],
    }).onDelete('set null'),
    check(
      'students_address_source_check',
      sql`(${t.addressGuardianId} IS NOT NULL) OR ((${t.addressLine1} IS NOT NULL) AND (${t.city} IS NOT NULL) AND (${t.postcode} IS NOT NULL))`,
    ),
    check(
      'students_leaving_reason_check',
      sql`${t.leavingReason} = ANY (ARRAY['left'::text, 'graduated'::text, 'transferred'::text])`,
    ),
  ],
).enableRLS()

export const classes = pgTable(
  'classes',
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    yearGroup: text().notNull(),
    roomNumber: text(),
    teacherId: uuid(),
    createdAt: timestamptz().default(sql`now()`),
    active: boolean().default(true).notNull(),
    academicYearId: uuid().notNull(),
  },
  (t) => [
    unique('classes_name_academic_year_id_key').on(t.name, t.academicYearId),
    index('classes_academic_year_id_idx').using('btree', t.academicYearId),
    index('classes_active_idx').using('btree', t.active),
    index('classes_teacher_id_idx').using('btree', t.teacherId),
    foreignKey({
      name: 'classes_academic_year_id_fkey',
      columns: [t.academicYearId],
      foreignColumns: [academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'classes_teacher_id_fkey',
      columns: [t.teacherId],
      foreignColumns: [staff.id],
    }).onDelete('set null'),
  ],
).enableRLS()

export const studentClasses = pgTable(
  'student_classes',
  {
    id: uuid().defaultRandom().primaryKey(),
    studentId: uuid().notNull(),
    classId: uuid().notNull(),
    enrolledAt: timestamptz().default(sql`now()`),
    startDate: date()
      .default(sql`((now() AT TIME ZONE 'Europe/London'::text))::date`)
      .notNull(),
    endDate: date(),
  },
  (t) => [
    index('student_classes_class_dates').using(
      'btree',
      t.classId,
      t.startDate,
      t.endDate,
    ),
    index('student_classes_class_id_idx').using('btree', t.classId),
    uniqueIndex('student_classes_one_open')
      .using('btree', t.studentId, t.classId)
      .where(sql`${t.endDate} IS NULL`),
    index('student_classes_student_id_idx').using('btree', t.studentId),
    foreignKey({
      name: 'student_classes_class_id_fkey',
      columns: [t.classId],
      foreignColumns: [classes.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'student_classes_student_id_fkey',
      columns: [t.studentId],
      foreignColumns: [students.id],
    }).onDelete('cascade'),
    check(
      'student_classes_dates_check',
      sql`(${t.endDate} IS NULL) OR (${t.endDate} >= ${t.startDate})`,
    ),
  ],
).enableRLS()

export const attendance = pgTable(
  'attendance',
  {
    id: uuid().defaultRandom().primaryKey(),
    classId: uuid().notNull(),
    studentId: uuid().notNull(),
    date: date().notNull(),
    status: text().$type<'present' | 'absent' | 'late'>().notNull(),
    notes: text(),
    recordedBy: uuid(),
    createdAt: timestamptz().default(sql`now()`),
    updatedAt: timestamptz()
      .default(sql`now()`)
      .$onUpdate(stamp),
  },
  (t) => [
    unique('attendance_class_student_date_key').on(
      t.classId,
      t.studentId,
      t.date,
    ),
    index('attendance_class_id_date_idx').using('btree', t.classId, t.date),
    index('attendance_student_id_idx').using('btree', t.studentId),
    foreignKey({
      name: 'attendance_class_id_fkey',
      columns: [t.classId],
      foreignColumns: [classes.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'attendance_recorded_by_fkey',
      columns: [t.recordedBy],
      foreignColumns: [staff.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'attendance_student_id_fkey',
      columns: [t.studentId],
      foreignColumns: [students.id],
    }).onDelete('cascade'),
    check(
      'attendance_status_check',
      sql`${t.status} = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text])`,
    ),
  ],
).enableRLS()

/**
 * One row per class per date: the register itself. A row means the register
 * was taken; `notes` holds the session's single free-text note.
 */
export const attendanceRegisters = pgTable(
  'attendance_registers',
  {
    id: uuid().defaultRandom().primaryKey(),
    classId: uuid().notNull(),
    date: date().notNull(),
    notes: text(),
    updatedBy: uuid(),
    createdAt: timestamptz().default(sql`now()`),
    updatedAt: timestamptz()
      .default(sql`now()`)
      .$onUpdate(stamp),
  },
  (t) => [
    unique('attendance_registers_class_id_date_key').on(t.classId, t.date),
    foreignKey({
      name: 'attendance_registers_class_id_fkey',
      columns: [t.classId],
      foreignColumns: [classes.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'attendance_registers_updated_by_fkey',
      columns: [t.updatedBy],
      foreignColumns: [staff.id],
    }).onDelete('set null'),
  ],
).enableRLS()

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid().defaultRandom().primaryKey(),
    staffId: uuid(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    details: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamptz().default(sql`now()`),
  },
  (t) => [
    index('idx_audit_log_created_at').using('btree', t.createdAt),
    index('idx_audit_log_entity').using('btree', t.entity),
    index('idx_audit_log_staff_id').using('btree', t.staffId),
    foreignKey({
      name: 'audit_log_staff_id_fkey',
      columns: [t.staffId],
      foreignColumns: [staff.id],
    }).onDelete('set null'),
  ],
).enableRLS()

export const feePlans = pgTable(
  'fee_plans',
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    fullYearAmount: money().notNull(),
    monthlyInstalmentAmount: money().notNull(),
    termlyInstalmentAmount: money().notNull(),
    notes: text(),
    active: boolean().default(true).notNull(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamptz()
      .default(sql`now()`)
      .notNull()
      .$onUpdate(stamp),
    academicYearId: uuid().notNull(),
  },
  (t) => [
    unique('fee_plans_name_academic_year_id_key').on(t.name, t.academicYearId),
    index('fee_plans_academic_year_id_idx').using('btree', t.academicYearId),
    foreignKey({
      name: 'fee_plans_academic_year_id_fkey',
      columns: [t.academicYearId],
      foreignColumns: [academicYears.id],
    }).onDelete('restrict'),
    check(
      'fee_plans_full_year_amount_check',
      sql`${t.fullYearAmount} >= (0)::numeric`,
    ),
    check(
      'fee_plans_monthly_instalment_amount_check',
      sql`${t.monthlyInstalmentAmount} >= (0)::numeric`,
    ),
    check(
      'fee_plans_termly_instalment_amount_check',
      sql`${t.termlyInstalmentAmount} >= (0)::numeric`,
    ),
  ],
).enableRLS()

export const feePlanClasses = pgTable(
  'fee_plan_classes',
  {
    id: uuid().defaultRandom().primaryKey(),
    feePlanId: uuid().notNull(),
    classId: uuid().notNull(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
  },
  (t) => [
    unique('fee_plan_classes_class_id_key').on(t.classId),
    index('fee_plan_classes_fee_plan_id_idx').using('btree', t.feePlanId),
    foreignKey({
      name: 'fee_plan_classes_class_id_fkey',
      columns: [t.classId],
      foreignColumns: [classes.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fee_plan_classes_fee_plan_id_fkey',
      columns: [t.feePlanId],
      foreignColumns: [feePlans.id],
    }).onDelete('cascade'),
  ],
).enableRLS()

export const incidents = pgTable(
  'incidents',
  {
    id: uuid().defaultRandom().primaryKey(),
    type: text().$type<'medical' | 'behaviour' | 'other'>().notNull(),
    studentId: uuid().notNull(),
    title: text().notNull(),
    description: text().notNull(),
    incidentDate: timestamptz().notNull(),
    createdBy: uuid().notNull(),
    updatedBy: uuid(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamptz()
      .default(sql`now()`)
      .notNull()
      .$onUpdate(stamp),
    parentNotified: boolean().default(false).notNull(),
    parentNotifiedAt: timestamptz(),
  },
  (t) => [
    index('idx_incidents_incident_date').using(
      'btree',
      t.incidentDate.desc().nullsFirst(),
    ),
    index('idx_incidents_student_id').using('btree', t.studentId),
    index('idx_incidents_type').using('btree', t.type),
    foreignKey({
      name: 'incidents_created_by_fkey',
      columns: [t.createdBy],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: 'incidents_student_id_fkey',
      columns: [t.studentId],
      foreignColumns: [students.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'incidents_updated_by_fkey',
      columns: [t.updatedBy],
      foreignColumns: [staff.id],
    }),
    check(
      'incidents_type_check',
      sql`${t.type} = ANY (ARRAY['medical'::text, 'behaviour'::text, 'other'::text])`,
    ),
  ],
).enableRLS()

export const lessonPlans = pgTable(
  'lesson_plans',
  {
    id: uuid().defaultRandom().primaryKey(),
    classId: uuid().notNull(),
    lessonDate: date().notNull(),
    description: text().notNull(),
    createdBy: uuid().notNull(),
    updatedBy: uuid(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamptz()
      .default(sql`now()`)
      .notNull()
      .$onUpdate(stamp),
  },
  (t) => [
    unique('lesson_plans_class_id_lesson_date_key').on(t.classId, t.lessonDate),
    index('lesson_plans_class_id_idx').using('btree', t.classId),
    index('lesson_plans_lesson_date_idx').using(
      'btree',
      t.lessonDate.desc().nullsFirst(),
    ),
    foreignKey({
      name: 'lesson_plans_class_id_fkey',
      columns: [t.classId],
      foreignColumns: [classes.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'lesson_plans_created_by_fkey',
      columns: [t.createdBy],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: 'lesson_plans_updated_by_fkey',
      columns: [t.updatedBy],
      foreignColumns: [staff.id],
    }),
  ],
).enableRLS()

export const photoConsentOptOuts = pgTable(
  'photo_consent_opt_outs',
  {
    id: uuid().defaultRandom().primaryKey(),
    status: photoOptOutStatus().default('pending').notNull(),
    submittedAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    childFirstName: text().notNull(),
    childLastName: text().notNull(),
    dateOfBirth: date().notNull(),
    declarationName: text().notNull(),
    notes: text(),
    actionedBy: uuid(),
    actionedAt: timestamptz(),
    studentId: uuid(),
    rejectedReason: text(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamptz()
      .default(sql`now()`)
      .notNull()
      .$onUpdate(stamp),
  },
  (t) => [
    index('photo_consent_opt_outs_status_idx').using('btree', t.status),
    index('photo_consent_opt_outs_submitted_at_idx').using(
      'btree',
      t.submittedAt.desc().nullsFirst(),
    ),
    foreignKey({
      name: 'photo_consent_opt_outs_actioned_by_fkey',
      columns: [t.actionedBy],
      foreignColumns: [staff.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'photo_consent_opt_outs_student_id_fkey',
      columns: [t.studentId],
      foreignColumns: [students.id],
    }).onDelete('set null'),
  ],
).enableRLS()

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid().defaultRandom().primaryKey(),
    staffId: uuid().notNull(),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    createdAt: timestamptz().default(sql`now()`),
  },
  (t) => [
    unique('push_subscriptions_endpoint_key').on(t.endpoint),
    index('push_subscriptions_staff_id_idx').using('btree', t.staffId),
    foreignKey({
      name: 'push_subscriptions_staff_id_fkey',
      columns: [t.staffId],
      foreignColumns: [staff.id],
    }).onDelete('cascade'),
  ],
).enableRLS()

export const registrationSubmissions = pgTable(
  'registration_submissions',
  {
    id: uuid().defaultRandom().primaryKey(),
    status: submissionStatus().default('pending').notNull(),
    submittedAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    childFirstName: text().notNull(),
    childLastName: text().notNull(),
    dateOfBirth: date().notNull(),
    preferredYearGroup: text(),
    addressLine1: text('address_line_1').notNull(),
    addressLine2: text('address_line_2'),
    city: text().notNull(),
    postcode: text().notNull(),
    allergies: text(),
    medicalDetails: text(),
    collectAuthorised: text(),
    collectPassword: text(),
    privacyNoticeRead: boolean().default(false).notNull(),
    firstAidConsent: boolean().default(false).notNull(),
    photoVideoConsent: boolean().default(false).notNull(),
    homeSchoolAgreement: boolean().default(false).notNull(),
    emailSmsContactAck: boolean().default(false).notNull(),
    declarationName: text().notNull(),
    actionedBy: uuid(),
    actionedAt: timestamptz(),
    studentId: uuid(),
    linkedExisting: boolean().default(false).notNull(),
    rejectedReason: text(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamptz()
      .default(sql`now()`)
      .notNull()
      .$onUpdate(stamp),
    englishSchoolName: text(),
    senDetails: text(),
    // True only when the parent ticked it; the box is offered from age 12.
    mayLeaveUnaccompanied: boolean().default(false).notNull(),
    // Set by the server on submit. Null on submissions from before versions
    // were tracked.
    consentsRecordedAt: timestamptz(),
    privacyNoticeVersion: text(),
  },
  (t) => [
    index('registration_submissions_status_idx').using('btree', t.status),
    index('registration_submissions_student_id_idx').using(
      'btree',
      t.studentId,
    ),
    index('registration_submissions_submitted_at_idx').using(
      'btree',
      t.submittedAt.desc().nullsFirst(),
    ),
    foreignKey({
      name: 'registration_submissions_actioned_by_fkey',
      columns: [t.actionedBy],
      foreignColumns: [staff.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'registration_submissions_student_id_fkey',
      columns: [t.studentId],
      foreignColumns: [students.id],
    }).onDelete('set null'),
  ],
).enableRLS()

export const registrationSubmissionContacts = pgTable(
  'registration_submission_contacts',
  {
    id: uuid().defaultRandom().primaryKey(),
    submissionId: uuid().notNull(),
    contactRole: contactRole().notNull(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    relationship: text(),
    phone: text().notNull(),
    email: text(),
    sameAsChildAddress: boolean().default(true).notNull(),
    addressLine1: text('address_line_1'),
    addressLine2: text('address_line_2'),
    city: text(),
    postcode: text(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    occupation: text(),
  },
  (t) => [
    unique(
      'registration_submission_contacts_submission_id_contact_role_key',
    ).on(t.submissionId, t.contactRole),
    index('registration_submission_contacts_submission_id_idx').using(
      'btree',
      t.submissionId,
    ),
    foreignKey({
      name: 'registration_submission_contacts_submission_id_fkey',
      columns: [t.submissionId],
      foreignColumns: [registrationSubmissions.id],
    }).onDelete('cascade'),
  ],
).enableRLS()

export const staffAttendance = pgTable(
  'staff_attendance',
  {
    id: uuid().defaultRandom().primaryKey(),
    staffId: uuid().notNull(),
    date: date()
      .default(sql`CURRENT_DATE`)
      .notNull(),
    signedInAt: timestamptz().notNull(),
    signedOutAt: timestamptz(),
    createdAt: timestamptz().default(sql`now()`),
    updatedAt: timestamptz()
      .default(sql`now()`)
      .$onUpdate(stamp),
  },
  (t) => [
    unique('staff_attendance_staff_id_date_key').on(t.staffId, t.date),
    index('staff_attendance_date_idx').using('btree', t.date),
    index('staff_attendance_staff_id_idx').using('btree', t.staffId),
    foreignKey({
      name: 'staff_attendance_staff_id_fkey',
      columns: [t.staffId],
      foreignColumns: [staff.id],
    }).onDelete('cascade'),
  ],
).enableRLS()

export const staffPayroll = pgTable(
  'staff_payroll',
  {
    id: uuid().defaultRandom().primaryKey(),
    staffId: uuid().notNull(),
    paymentFunding: text().notNull(),
    bankAccountName: text(),
    bankSortCode: text(),
    bankAccountNumber: text(),
    payrollRef: text(),
    nationalInsuranceNumber: text(),
    addressLine1: text('address_line_1'),
    addressLine2: text('address_line_2'),
    city: text(),
    postcode: text(),
    idVerified: boolean().default(false).notNull(),
    idVerifiedAt: date(),
    idType: text(),
    idVerifiedBy: uuid(),
    rightToWorkChecked: boolean().default(false).notNull(),
    rightToWorkCheckedAt: date(),
    dbsVerified: boolean().default(false).notNull(),
    dbsLevel: text(),
    dbsBarredListChecked: boolean().default(false).notNull(),
    dbsUpdateService: boolean().default(false).notNull(),
    dbsReference: text(),
    dbsIssueDate: date(),
    dbsVerifiedAt: date(),
    dbsRenewalDue: date(),
    dbsVerifiedBy: uuid(),
    firstAidCertified: boolean().default(false).notNull(),
    firstAidIssueDate: date(),
    firstAidVerifiedAt: date(),
    firstAidExpiryDate: date(),
    firstAidReference: text(),
    fireWardenCertified: boolean().default(false).notNull(),
    fireWardenIssueDate: date(),
    fireWardenVerifiedAt: date(),
    fireWardenExpiryDate: date(),
    fireWardenReference: text(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamptz()
      .default(sql`now()`)
      .notNull()
      .$onUpdate(stamp),
  },
  (t) => [
    unique('staff_payroll_staff_id_key').on(t.staffId),
    index('staff_payroll_staff_id_idx').using('btree', t.staffId),
    foreignKey({
      name: 'staff_payroll_dbs_verified_by_fkey',
      columns: [t.dbsVerifiedBy],
      foreignColumns: [staff.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'staff_payroll_id_verified_by_fkey',
      columns: [t.idVerifiedBy],
      foreignColumns: [staff.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'staff_payroll_staff_id_fkey',
      columns: [t.staffId],
      foreignColumns: [staff.id],
    }).onDelete('cascade'),
    check(
      'staff_payroll_address_details_check',
      sql`((${t.addressLine1} IS NULL) AND (${t.addressLine2} IS NULL) AND (${t.city} IS NULL) AND (${t.postcode} IS NULL)) OR ((${t.addressLine1} IS NOT NULL) AND (${t.city} IS NOT NULL) AND (${t.postcode} IS NOT NULL))`,
    ),
    check(
      'staff_payroll_bank_account_number_check',
      sql`(${t.bankAccountNumber} IS NULL) OR (${t.bankAccountNumber} ~ '^[0-9]{8}$'::text)`,
    ),
    check(
      'staff_payroll_bank_sort_code_check',
      sql`(${t.bankSortCode} IS NULL) OR (${t.bankSortCode} ~ '^[0-9]{6}$'::text)`,
    ),
    check(
      'staff_payroll_dbs_level_check',
      sql`(${t.dbsLevel} IS NULL) OR (${t.dbsLevel} = ANY (ARRAY['enhanced'::text, 'standard'::text, 'basic'::text]))`,
    ),
    check(
      'staff_payroll_dbs_verified_details_check',
      sql`(NOT ${t.dbsVerified}) OR ((${t.dbsReference} IS NOT NULL) AND (${t.dbsIssueDate} IS NOT NULL) AND (${t.dbsVerifiedAt} IS NOT NULL) AND (${t.dbsLevel} IS NOT NULL))`,
    ),
    check(
      'staff_payroll_fire_warden_details_check',
      sql`(NOT ${t.fireWardenCertified}) OR ((${t.fireWardenReference} IS NOT NULL) AND (${t.fireWardenIssueDate} IS NOT NULL) AND (${t.fireWardenVerifiedAt} IS NOT NULL))`,
    ),
    check(
      'staff_payroll_first_aid_details_check',
      sql`(NOT ${t.firstAidCertified}) OR ((${t.firstAidReference} IS NOT NULL) AND (${t.firstAidIssueDate} IS NOT NULL) AND (${t.firstAidVerifiedAt} IS NOT NULL))`,
    ),
    check(
      'staff_payroll_id_type_check',
      sql`(${t.idType} IS NULL) OR (${t.idType} = ANY (ARRAY['passport'::text, 'driving_licence'::text, 'brp'::text, 'birth_certificate'::text, 'other'::text]))`,
    ),
    check(
      'staff_payroll_id_verified_details_check',
      sql`(NOT ${t.idVerified}) OR ((${t.idVerifiedAt} IS NOT NULL) AND (${t.idType} IS NOT NULL))`,
    ),
    check(
      'staff_payroll_payment_funding_check',
      sql`${t.paymentFunding} = ANY (ARRAY['kea'::text, 'school'::text])`,
    ),
  ],
).enableRLS()

export const studentFeeAccounts = pgTable(
  'student_fee_accounts',
  {
    id: uuid().defaultRandom().primaryKey(),
    studentId: uuid().notNull(),
    paymentPlan: text(),
    paymentPlanNotes: text(),
    feePlanOverrideId: uuid(),
    customTotalAmount: money(),
    customUpToDate: boolean().default(false).notNull(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamptz()
      .default(sql`now()`)
      .notNull()
      .$onUpdate(stamp),
    academicYearId: uuid().notNull(),
    settled: boolean().default(false).notNull(),
    settledNote: text(),
  },
  (t) => [
    unique('student_fee_accounts_student_id_academic_year_id_key').on(
      t.studentId,
      t.academicYearId,
    ),
    index('student_fee_accounts_academic_year_id_idx').using(
      'btree',
      t.academicYearId,
    ),
    foreignKey({
      name: 'student_fee_accounts_academic_year_id_fkey',
      columns: [t.academicYearId],
      foreignColumns: [academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'student_fee_accounts_fee_plan_override_id_fkey',
      columns: [t.feePlanOverrideId],
      foreignColumns: [feePlans.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'student_fee_accounts_student_id_fkey',
      columns: [t.studentId],
      foreignColumns: [students.id],
    }).onDelete('cascade'),
    check(
      'student_fee_accounts_custom_total_amount_check',
      sql`(${t.customTotalAmount} IS NULL) OR (${t.customTotalAmount} >= (0)::numeric)`,
    ),
    check(
      'student_fee_accounts_payment_plan_check',
      sql`(${t.paymentPlan} IS NULL) OR (${t.paymentPlan} = ANY (ARRAY['monthly'::text, 'termly'::text, 'yearly'::text, 'custom'::text]))`,
    ),
  ],
).enableRLS()

export const studentPayments = pgTable(
  'student_payments',
  {
    id: uuid().defaultRandom().primaryKey(),
    studentId: uuid().notNull(),
    amount: money().notNull(),
    paymentDate: date().notNull(),
    reference: text().notNull(),
    method: text().notNull(),
    notes: text(),
    recordedBy: uuid(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    academicYearId: uuid().notNull(),
  },
  (t) => [
    index('student_payments_academic_year_id_idx').using(
      'btree',
      t.academicYearId,
    ),
    index('student_payments_payment_date_idx').using(
      'btree',
      t.paymentDate.desc().nullsFirst(),
    ),
    index('student_payments_student_id_idx').using('btree', t.studentId),
    foreignKey({
      name: 'student_payments_academic_year_id_fkey',
      columns: [t.academicYearId],
      foreignColumns: [academicYears.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'student_payments_recorded_by_fkey',
      columns: [t.recordedBy],
      foreignColumns: [staff.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'student_payments_student_id_fkey',
      columns: [t.studentId],
      foreignColumns: [students.id],
    }).onDelete('cascade'),
    check('student_payments_amount_check', sql`${t.amount} > (0)::numeric`),
    check(
      'student_payments_method_check',
      sql`${t.method} = ANY (ARRAY['bank_transfer'::text, 'cash'::text, 'card'::text, 'other'::text])`,
    ),
  ],
).enableRLS()

// ─── Relations ──────────────────────────────────────────────────────────────

export const academicYearsRelations = relations(academicYears, ({ many }) => ({
  classes: many(classes),
  feePlans: many(feePlans),
  studentFeeAccounts: many(studentFeeAccounts),
  studentPayments: many(studentPayments),
}))

export const staffRelations = relations(staff, ({ one, many }) => ({
  classes: many(classes),
  attendanceRecorded: many(attendance),
  auditLog: many(auditLog),
  incidentsCreated: many(incidents, { relationName: 'incidentCreatedBy' }),
  incidentsUpdated: many(incidents, { relationName: 'incidentUpdatedBy' }),
  lessonPlansCreated: many(lessonPlans, {
    relationName: 'lessonPlanCreatedBy',
  }),
  lessonPlansUpdated: many(lessonPlans, {
    relationName: 'lessonPlanUpdatedBy',
  }),
  photoOptOutsActioned: many(photoConsentOptOuts),
  pushSubscriptions: many(pushSubscriptions),
  registrationsActioned: many(registrationSubmissions),
  attendance: many(staffAttendance),
  payroll: one(staffPayroll, {
    fields: [staff.id],
    references: [staffPayroll.staffId],
    relationName: 'payrollStaff',
  }),
  payrollIdVerified: many(staffPayroll, {
    relationName: 'payrollIdVerifiedBy',
  }),
  payrollDbsVerified: many(staffPayroll, {
    relationName: 'payrollDbsVerifiedBy',
  }),
  paymentsRecorded: many(studentPayments),
}))

export const guardiansRelations = relations(guardians, ({ many }) => ({
  primaryFor: many(students, { relationName: 'primaryGuardian' }),
  secondaryFor: many(students, { relationName: 'secondaryGuardian' }),
  additionalContact1For: many(students, {
    relationName: 'additionalContact1',
  }),
  additionalContact2For: many(students, {
    relationName: 'additionalContact2',
  }),
  addressFor: many(students, { relationName: 'addressGuardian' }),
}))

export const studentsRelations = relations(students, ({ one, many }) => ({
  primaryGuardian: one(guardians, {
    fields: [students.primaryGuardianId],
    references: [guardians.id],
    relationName: 'primaryGuardian',
  }),
  secondaryGuardian: one(guardians, {
    fields: [students.secondaryGuardianId],
    references: [guardians.id],
    relationName: 'secondaryGuardian',
  }),
  additionalContact1: one(guardians, {
    fields: [students.additionalContact1Id],
    references: [guardians.id],
    relationName: 'additionalContact1',
  }),
  additionalContact2: one(guardians, {
    fields: [students.additionalContact2Id],
    references: [guardians.id],
    relationName: 'additionalContact2',
  }),
  addressGuardian: one(guardians, {
    fields: [students.addressGuardianId],
    references: [guardians.id],
    relationName: 'addressGuardian',
  }),
  studentClasses: many(studentClasses),
  attendance: many(attendance),
  incidents: many(incidents),
  photoOptOuts: many(photoConsentOptOuts),
  registrations: many(registrationSubmissions),
  feeAccounts: many(studentFeeAccounts),
  payments: many(studentPayments),
}))

export const classesRelations = relations(classes, ({ one, many }) => ({
  academicYear: one(academicYears, {
    fields: [classes.academicYearId],
    references: [academicYears.id],
  }),
  teacher: one(staff, {
    fields: [classes.teacherId],
    references: [staff.id],
  }),
  studentClasses: many(studentClasses),
  attendance: many(attendance),
  feePlanClass: one(feePlanClasses, {
    fields: [classes.id],
    references: [feePlanClasses.classId],
  }),
  lessonPlans: many(lessonPlans),
}))

export const studentClassesRelations = relations(studentClasses, ({ one }) => ({
  student: one(students, {
    fields: [studentClasses.studentId],
    references: [students.id],
  }),
  class: one(classes, {
    fields: [studentClasses.classId],
    references: [classes.id],
  }),
}))

export const attendanceRelations = relations(attendance, ({ one }) => ({
  class: one(classes, {
    fields: [attendance.classId],
    references: [classes.id],
  }),
  student: one(students, {
    fields: [attendance.studentId],
    references: [students.id],
  }),
  recorder: one(staff, {
    fields: [attendance.recordedBy],
    references: [staff.id],
  }),
}))

export const attendanceRegistersRelations = relations(
  attendanceRegisters,
  ({ one }) => ({
    class: one(classes, {
      fields: [attendanceRegisters.classId],
      references: [classes.id],
    }),
    updater: one(staff, {
      fields: [attendanceRegisters.updatedBy],
      references: [staff.id],
    }),
  }),
)

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  staff: one(staff, {
    fields: [auditLog.staffId],
    references: [staff.id],
  }),
}))

export const feePlansRelations = relations(feePlans, ({ one, many }) => ({
  academicYear: one(academicYears, {
    fields: [feePlans.academicYearId],
    references: [academicYears.id],
  }),
  feePlanClasses: many(feePlanClasses),
  overriddenAccounts: many(studentFeeAccounts),
}))

export const feePlanClassesRelations = relations(feePlanClasses, ({ one }) => ({
  feePlan: one(feePlans, {
    fields: [feePlanClasses.feePlanId],
    references: [feePlans.id],
  }),
  class: one(classes, {
    fields: [feePlanClasses.classId],
    references: [classes.id],
  }),
}))

export const incidentsRelations = relations(incidents, ({ one }) => ({
  student: one(students, {
    fields: [incidents.studentId],
    references: [students.id],
  }),
  creator: one(staff, {
    fields: [incidents.createdBy],
    references: [staff.id],
    relationName: 'incidentCreatedBy',
  }),
  updater: one(staff, {
    fields: [incidents.updatedBy],
    references: [staff.id],
    relationName: 'incidentUpdatedBy',
  }),
}))

export const lessonPlansRelations = relations(lessonPlans, ({ one }) => ({
  class: one(classes, {
    fields: [lessonPlans.classId],
    references: [classes.id],
  }),
  creator: one(staff, {
    fields: [lessonPlans.createdBy],
    references: [staff.id],
    relationName: 'lessonPlanCreatedBy',
  }),
  updater: one(staff, {
    fields: [lessonPlans.updatedBy],
    references: [staff.id],
    relationName: 'lessonPlanUpdatedBy',
  }),
}))

export const photoConsentOptOutsRelations = relations(
  photoConsentOptOuts,
  ({ one }) => ({
    actionedByStaff: one(staff, {
      fields: [photoConsentOptOuts.actionedBy],
      references: [staff.id],
    }),
    student: one(students, {
      fields: [photoConsentOptOuts.studentId],
      references: [students.id],
    }),
  }),
)

export const pushSubscriptionsRelations = relations(
  pushSubscriptions,
  ({ one }) => ({
    staff: one(staff, {
      fields: [pushSubscriptions.staffId],
      references: [staff.id],
    }),
  }),
)

export const registrationSubmissionsRelations = relations(
  registrationSubmissions,
  ({ one, many }) => ({
    actionedByStaff: one(staff, {
      fields: [registrationSubmissions.actionedBy],
      references: [staff.id],
    }),
    student: one(students, {
      fields: [registrationSubmissions.studentId],
      references: [students.id],
    }),
    contacts: many(registrationSubmissionContacts),
  }),
)

export const registrationSubmissionContactsRelations = relations(
  registrationSubmissionContacts,
  ({ one }) => ({
    submission: one(registrationSubmissions, {
      fields: [registrationSubmissionContacts.submissionId],
      references: [registrationSubmissions.id],
    }),
  }),
)

export const staffAttendanceRelations = relations(
  staffAttendance,
  ({ one }) => ({
    staff: one(staff, {
      fields: [staffAttendance.staffId],
      references: [staff.id],
    }),
  }),
)

export const staffPayrollRelations = relations(staffPayroll, ({ one }) => ({
  staff: one(staff, {
    fields: [staffPayroll.staffId],
    references: [staff.id],
    relationName: 'payrollStaff',
  }),
  idVerifiedByStaff: one(staff, {
    fields: [staffPayroll.idVerifiedBy],
    references: [staff.id],
    relationName: 'payrollIdVerifiedBy',
  }),
  dbsVerifiedByStaff: one(staff, {
    fields: [staffPayroll.dbsVerifiedBy],
    references: [staff.id],
    relationName: 'payrollDbsVerifiedBy',
  }),
}))

export const studentFeeAccountsRelations = relations(
  studentFeeAccounts,
  ({ one }) => ({
    student: one(students, {
      fields: [studentFeeAccounts.studentId],
      references: [students.id],
    }),
    academicYear: one(academicYears, {
      fields: [studentFeeAccounts.academicYearId],
      references: [academicYears.id],
    }),
    feePlanOverride: one(feePlans, {
      fields: [studentFeeAccounts.feePlanOverrideId],
      references: [feePlans.id],
    }),
  }),
)

export const studentPaymentsRelations = relations(
  studentPayments,
  ({ one }) => ({
    student: one(students, {
      fields: [studentPayments.studentId],
      references: [students.id],
    }),
    academicYear: one(academicYears, {
      fields: [studentPayments.academicYearId],
      references: [academicYears.id],
    }),
    recorder: one(staff, {
      fields: [studentPayments.recordedBy],
      references: [staff.id],
    }),
  }),
)

// ─── Row types ──────────────────────────────────────────────────────────────

export type AcademicYear = typeof academicYears.$inferSelect
export type NewAcademicYear = typeof academicYears.$inferInsert
export type Staff = typeof staff.$inferSelect
export type NewStaff = typeof staff.$inferInsert
export type Guardian = typeof guardians.$inferSelect
export type NewGuardian = typeof guardians.$inferInsert
export type Student = typeof students.$inferSelect
export type NewStudent = typeof students.$inferInsert
export type Class = typeof classes.$inferSelect
export type NewClass = typeof classes.$inferInsert
export type StudentClass = typeof studentClasses.$inferSelect
export type NewStudentClass = typeof studentClasses.$inferInsert
export type Attendance = typeof attendance.$inferSelect
export type NewAttendance = typeof attendance.$inferInsert
export type AttendanceRegister = typeof attendanceRegisters.$inferSelect
export type NewAttendanceRegister = typeof attendanceRegisters.$inferInsert
export type AuditLog = typeof auditLog.$inferSelect
export type NewAuditLog = typeof auditLog.$inferInsert
export type FeePlan = typeof feePlans.$inferSelect
export type NewFeePlan = typeof feePlans.$inferInsert
export type FeePlanClass = typeof feePlanClasses.$inferSelect
export type NewFeePlanClass = typeof feePlanClasses.$inferInsert
export type Incident = typeof incidents.$inferSelect
export type NewIncident = typeof incidents.$inferInsert
export type LessonPlan = typeof lessonPlans.$inferSelect
export type NewLessonPlan = typeof lessonPlans.$inferInsert
export type PhotoConsentOptOut = typeof photoConsentOptOuts.$inferSelect
export type NewPhotoConsentOptOut = typeof photoConsentOptOuts.$inferInsert
export type PushSubscription = typeof pushSubscriptions.$inferSelect
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert
export type RegistrationSubmission = typeof registrationSubmissions.$inferSelect
export type NewRegistrationSubmission =
  typeof registrationSubmissions.$inferInsert
export type RegistrationSubmissionContact =
  typeof registrationSubmissionContacts.$inferSelect
export type NewRegistrationSubmissionContact =
  typeof registrationSubmissionContacts.$inferInsert
export type StaffAttendance = typeof staffAttendance.$inferSelect
export type NewStaffAttendance = typeof staffAttendance.$inferInsert
export type StaffPayroll = typeof staffPayroll.$inferSelect
export type NewStaffPayroll = typeof staffPayroll.$inferInsert
export type StudentFeeAccount = typeof studentFeeAccounts.$inferSelect
export type NewStudentFeeAccount = typeof studentFeeAccounts.$inferInsert
export type StudentPayment = typeof studentPayments.$inferSelect
export type NewStudentPayment = typeof studentPayments.$inferInsert
