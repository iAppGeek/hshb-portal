// Pure date helpers for staff compliance records (DBS, first aid, fire warden).
// Dates are ISO `YYYY-MM-DD` strings and are compared as UTC calendar days.

export const EXPIRY_WARNING_DAYS = 60
export const DBS_RENEWAL_YEARS = 3

export type ExpiryState = 'expired' | 'expiring' | 'ok'

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate)
  date.setUTCDate(date.getUTCDate() + days)
  return toIsoDate(date)
}

/** 29 Feb rolls back to 28 Feb in a non-leap target year. */
export function addYears(isoDate: string, years: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const targetYear = year + years
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate()
  return toIsoDate(
    new Date(Date.UTC(targetYear, month - 1, Math.min(day, lastDay))),
  )
}

export function expiryState(
  expiry: string | null,
  today: string,
  warningDays: number = EXPIRY_WARNING_DAYS,
): ExpiryState | null {
  if (!expiry) return null
  if (expiry < today) return 'expired'
  if (expiry <= addDays(today, warningDays)) return 'expiring'
  return 'ok'
}

// ─── Labels ──────────────────────────────────────────────────────────────────
// Keys mirror the CHECK constraints in the finance_payments migration.

export type PaymentFunding = 'kea' | 'school'
export type IdType =
  | 'passport'
  | 'driving_licence'
  | 'brp'
  | 'birth_certificate'
  | 'other'
export type DbsLevel = 'enhanced' | 'standard' | 'basic'

export const PAYMENT_FUNDING_LABELS: Record<PaymentFunding, string> = {
  kea: 'KEA',
  school: 'School',
}

export const ID_TYPE_LABELS: Record<IdType, string> = {
  passport: 'Passport',
  driving_licence: 'Driving licence',
  brp: 'Biometric residence permit (BRP)',
  birth_certificate: 'Birth certificate',
  other: 'Other',
}

export const DBS_LEVEL_LABELS: Record<DbsLevel, string> = {
  enhanced: 'Enhanced',
  standard: 'Standard',
  basic: 'Basic',
}

export function labelFor<K extends string>(
  labels: Record<K, string>,
  value: string | null,
): string {
  return value !== null && value in labels ? labels[value as K] : '—'
}

/** Bank details are only ever shown in full on the edit page. */
export function maskLastFour(value: string | null): string | null {
  return value ? `••••${value.slice(-4)}` : null
}
