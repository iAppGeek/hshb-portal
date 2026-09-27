/** The fields of a Postgres error that the app acts on. */
export type DbError = {
  code: string
  message: string
  details?: string
  constraint?: string
}

type ErrorFields = {
  code?: unknown
  message?: unknown
  detail?: unknown
  details?: unknown
  constraint_name?: unknown
  cause?: unknown
}

function fieldsOf(value: unknown): ErrorFields | null {
  return typeof value === 'object' && value !== null
    ? (value as ErrorFields)
    : null
}

function stringOr(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * The Postgres error behind `err`, or null when it isn't one. Understands
 * postgres.js errors (`detail`, `constraint_name`), including when Drizzle
 * wraps them in a DrizzleQueryError as `cause`, and the PostgREST shape
 * (`details`) that the remaining supabase-js `.rpc()` calls still throw.
 */
export function asDbError(err: unknown): DbError | null {
  const outer = fieldsOf(err)
  const source =
    typeof outer?.code === 'string' ? outer : fieldsOf(outer?.cause)
  if (!source || typeof source.code !== 'string') return null
  return {
    code: source.code,
    message: stringOr(source.message) ?? '',
    details: stringOr(source.detail) ?? stringOr(source.details),
    constraint: stringOr(source.constraint_name),
  }
}

function extractColumnFromDetail(details: string): string | null {
  const match = details.match(/Key \((\w+)\)/)
  return match ? match[1].replace(/_/g, ' ') : null
}

export function getUserFriendlyDbError(err: unknown, fallback: string): string {
  const dbError = asDbError(err)
  if (!dbError) return fallback

  switch (dbError.code) {
    case '23505': {
      const column = dbError.details
        ? extractColumnFromDetail(dbError.details)
        : null
      return column
        ? `A record with this ${column} already exists.`
        : 'A record with this value already exists.'
    }
    case '23503':
      return 'This record is linked to other data and cannot be changed this way.'
    case '23502':
      return 'A required field is missing.'
    case '23514':
      return 'A value does not meet the required conditions.'
    case '22P02':
      return 'A value is not in the expected format.'
    case 'P0001':
      // Postgres's generic RAISE EXCEPTION code — used for our own
      // intentionally user-facing messages raised inside RPCs (e.g.
      // approve_registration, migrate_class), safe to show verbatim.
      return dbError.message
    default:
      return fallback
  }
}
