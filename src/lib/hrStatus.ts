// The single home of the HR compliance rules: per-person overall status, the
// DBS "checked this school year" state and the school-wide summary (staff
// statuses plus first aider and fire warden cover). Pure, so it is unit tested
// in isolation; the HR page and the dashboard tile both render from it.
//
// Dates are ISO `YYYY-MM-DD` strings compared as calendar days.

import {
  addYears,
  DBS_RENEWAL_YEARS,
  EXPIRY_WARNING_DAYS,
  expiryState,
  type JobRole,
} from './compliance'
import { formatCalendarDate } from './datetime'

export type StatusLevel = 'ok' | 'warning' | 'error'

export type Status = {
  level: StatusLevel
  /** Why the status is not `ok`; empty when it is. */
  reasons: string[]
}

export type SchoolYear = { start_date: string; end_date: string }

/** The payroll fields the rules read; a full payroll row satisfies it. */
export type ComplianceRecord = {
  job_role: string
  payment_funding: string
  /** The database stores line 1, city and postcode together or not at all. */
  address_line_1: string | null
  id_verified: boolean
  right_to_work_checked: boolean
  dbs_verified: boolean
  dbs_level: string | null
  dbs_update_service: boolean
  dbs_reference: string | null
  dbs_issue_date: string | null
  dbs_verified_at: string | null
  /** Recorded for reference; the status rules do not read it. */
  dbs_renewal_due: string | null
  first_aid_certified: boolean
  first_aid_expiry_date: string | null
  fire_warden_certified: boolean
  fire_warden_expiry_date: string | null
}

export const REGULATED_ROLES: readonly JobRole[] = [
  'teacher',
  'classroom_assistant',
  'admin',
]

export const MIN_FIRST_AIDERS = 4
export const MIN_FIRE_WARDENS = 2

export const NO_CURRENT_YEAR_MESSAGE =
  'No academic year is marked as current, so DBS checks this school year cannot be confirmed.'

function formatDate(date: string): string {
  return formatCalendarDate(date, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const LEVEL_RANK: Record<StatusLevel, number> = { ok: 0, warning: 1, error: 2 }

export function worstLevel(levels: StatusLevel[]): StatusLevel {
  return levels.reduce<StatusLevel>(
    (worst, level) => (LEVEL_RANK[level] > LEVEL_RANK[worst] ? level : worst),
    'ok',
  )
}

function statusFrom(issues: [StatusLevel, string][]): Status {
  const level = worstLevel(issues.map(([l]) => l))
  // Errors first so the most serious reason leads the tooltip.
  const reasons = [...issues]
    .sort(([a], [b]) => LEVEL_RANK[b] - LEVEL_RANK[a])
    .map(([, reason]) => reason)
  return { level, reasons }
}

export function isRegulatedRole(role: string): boolean {
  return (REGULATED_ROLES as readonly string[]).includes(role)
}

function inYear(date: string | null, year: SchoolYear | null): boolean {
  return (
    date !== null &&
    year !== null &&
    date >= year.start_date &&
    date <= year.end_date
  )
}

/**
 * The day a certificate DBS stops counting: three years after issue. On the
 * Update Service it has none; only the check this school year matters.
 */
export function dbsExpiryDate(record: ComplianceRecord): string | null {
  if (record.dbs_update_service || !record.dbs_issue_date) return null
  return addYears(record.dbs_issue_date, DBS_RENEWAL_YEARS)
}

/** Any DBS detail recorded, verified or not. */
export function hasDbsOnRecord(record: ComplianceRecord): boolean {
  return Boolean(
    record.dbs_verified ||
    record.dbs_level ||
    record.dbs_reference ||
    record.dbs_issue_date,
  )
}

/** The HR list's DBS column: verified during the current school year. */
export function dbsCheckedStatus(
  record: ComplianceRecord | null,
  year: SchoolYear | null,
): Status {
  if (!record || !record.dbs_verified || !record.dbs_verified_at) {
    return { level: 'error', reasons: ['DBS has not been verified'] }
  }
  if (!year) return { level: 'error', reasons: [NO_CURRENT_YEAR_MESSAGE] }
  if (!inYear(record.dbs_verified_at, year)) {
    return {
      level: 'error',
      reasons: ['DBS has not been verified this school year'],
    }
  }
  return { level: 'ok', reasons: [] }
}

/**
 * Whether the DBS counts: verified this school year, and either on the Update
 * Service or issued within the last three years. Returns the reasons it does
 * not.
 */
function dbsValidityIssues(
  record: ComplianceRecord,
  year: SchoolYear | null,
  today: string,
): string[] {
  const issues: string[] = []
  const checked = dbsCheckedStatus(record, year)
  issues.push(...checked.reasons)
  if (isDbsExpired(record, today)) {
    issues.push(
      `DBS was issued more than ${DBS_RENEWAL_YEARS} years ago and is not on the Update Service`,
    )
  }
  return issues
}

/**
 * Whether a certificate DBS has reached its third anniversary. Never true on
 * the Update Service.
 */
export function isDbsExpired(record: ComplianceRecord, today: string): boolean {
  const expiry = dbsExpiryDate(record)
  return expiry !== null && expiry <= today
}

/** Highlights a row whose DBS, first aid or fire warden certificate lapsed. */
export function hasLapsedCertificate(
  record: ComplianceRecord,
  today: string,
): boolean {
  return (
    (record.dbs_verified && isDbsExpired(record, today)) ||
    (record.first_aid_certified &&
      expiryState(record.first_aid_expiry_date, today) === 'expired') ||
    (record.fire_warden_certified &&
      expiryState(record.fire_warden_expiry_date, today) === 'expired')
  )
}

function dbsIssues(
  record: ComplianceRecord,
  year: SchoolYear | null,
  today: string,
): [StatusLevel, string][] {
  const regulated = isRegulatedRole(record.job_role)

  if (!hasDbsOnRecord(record)) {
    return regulated
      ? [
          [
            'error',
            'No DBS recorded; an enhanced DBS is required for this role',
          ],
        ]
      : [['warning', 'No DBS recorded']]
  }

  const invalid = dbsValidityIssues(record, year, today)
  if (invalid.length > 0) {
    return invalid.map((reason) => ['error', reason])
  }

  const issues: [StatusLevel, string][] = []
  if (regulated && record.dbs_level !== 'enhanced') {
    issues.push([
      'error',
      'Basic DBS held; an enhanced DBS is required for this role',
    ])
  }
  // Only a certificate DBS lapses, so only it is warned about in advance.
  const expiry = dbsExpiryDate(record)
  if (expiry && expiryState(expiry, today) === 'expiring') {
    issues.push([
      'warning',
      `DBS lapses on ${formatDate(expiry)} (within ${EXPIRY_WARNING_DAYS} days)`,
    ])
  }
  return issues
}

/** A person's overall compliance status; `null` means no HR record. */
export function staffComplianceStatus(
  record: ComplianceRecord | null,
  year: SchoolYear | null,
  today: string,
): Status {
  if (!record) return { level: 'error', reasons: ['No HR record'] }

  const issues = dbsIssues(record, year, today)
  // Everyone on the system has their ID checked; right to work applies to
  // anyone employed, whatever the role, so only volunteers are exempt.
  if (!record.id_verified) {
    issues.push(['error', 'ID has not been verified'])
  }
  if (record.payment_funding !== 'volunteer' && !record.right_to_work_checked) {
    issues.push(['error', 'Right to work has not been checked'])
  }
  if (!record.address_line_1) {
    issues.push(['warning', 'No address recorded'])
  }
  return statusFrom(issues)
}

function hasValidCertificate(
  certified: boolean,
  expiry: string | null,
  today: string,
): boolean {
  return certified && (expiry === null || expiry >= today)
}

export function isValidFirstAider(
  record: ComplianceRecord | null,
  today: string,
): boolean {
  return (
    record !== null &&
    hasValidCertificate(
      record.first_aid_certified,
      record.first_aid_expiry_date,
      today,
    )
  )
}

export function isValidFireWarden(
  record: ComplianceRecord | null,
  today: string,
): boolean {
  return (
    record !== null &&
    hasValidCertificate(
      record.fire_warden_certified,
      record.fire_warden_expiry_date,
      today,
    )
  )
}

/** Meets `minimum` → ok, one short → warning, otherwise error. */
export function coverStatus(
  count: number,
  minimum: number,
  label: string,
): Status {
  if (count >= minimum) return { level: 'ok', reasons: [] }
  const level: StatusLevel = count === minimum - 1 ? 'warning' : 'error'
  return {
    level,
    reasons: [`${count} valid ${label}; at least ${minimum} are needed`],
  }
}

export type ComplianceSummary = {
  overall: Status
  staff: Record<StatusLevel, number>
  staffStatus: Status
  firstAiders: { count: number; status: Status }
  fireWardens: { count: number; status: Status }
  noCurrentYear: boolean
}

export function complianceSummary(
  records: (ComplianceRecord | null)[],
  year: SchoolYear | null,
  today: string,
): ComplianceSummary {
  const staff: Record<StatusLevel, number> = { ok: 0, warning: 0, error: 0 }
  for (const record of records) {
    staff[staffComplianceStatus(record, year, today).level] += 1
  }

  const staffIssues: [StatusLevel, string][] = []
  if (staff.error > 0) {
    staffIssues.push(['error', `${staff.error} staff need action`])
  }
  if (staff.warning > 0) {
    staffIssues.push(['warning', `${staff.warning} staff have warnings`])
  }
  const staffStatus = statusFrom(staffIssues)

  const firstAidCount = records.filter((r) =>
    isValidFirstAider(r, today),
  ).length
  const fireWardenCount = records.filter((r) =>
    isValidFireWarden(r, today),
  ).length
  const firstAiders = {
    count: firstAidCount,
    status: coverStatus(firstAidCount, MIN_FIRST_AIDERS, 'first aiders'),
  }
  const fireWardens = {
    count: fireWardenCount,
    status: coverStatus(fireWardenCount, MIN_FIRE_WARDENS, 'fire wardens'),
  }

  const overallIssues: [StatusLevel, string][] = [
    ...(year
      ? []
      : [['error', NO_CURRENT_YEAR_MESSAGE] as [StatusLevel, string]]),
    ...staffIssues,
    ...firstAiders.status.reasons.map((r): [StatusLevel, string] => [
      firstAiders.status.level,
      r,
    ]),
    ...fireWardens.status.reasons.map((r): [StatusLevel, string] => [
      fireWardens.status.level,
      r,
    ]),
  ]

  return {
    overall: statusFrom(overallIssues),
    staff,
    staffStatus,
    firstAiders,
    fireWardens,
    noCurrentYear: year === null,
  }
}

export const STATUS_LABELS: Record<StatusLevel, string> = {
  ok: 'OK',
  warning: 'Warning',
  error: 'Action needed',
}
