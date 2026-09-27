import { customType } from 'drizzle-orm/pg-core'

/**
 * Postgres' text output for `timestamptz` ("2026-09-27 12:00:00.123+00") in
 * the ISO form PostgREST returned ("2026-09-27T12:00:00.123+00:00"), which
 * every browser's `Date` parses — Safari rejects the space and the bare hour
 * offset. Idempotent, because relational queries hand over values that
 * already went through `to_json`.
 */
export function toIsoTimestamp(value: string): string {
  const iso = value.replace(' ', 'T')
  return /[+-]\d{2}$/.test(iso) ? `${iso}:00` : iso
}

/** `timestamp with time zone`, read and written as an ISO string. */
export const timestamptz = customType<{ data: string; driverData: string }>({
  dataType: () => 'timestamp with time zone',
  fromDriver: toIsoTimestamp,
})
