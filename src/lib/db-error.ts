/**
 * A rule of a `src/db` write that the input broke (e.g. "Leavers can't be
 * enrolled in classes."). The message is written for the user, so
 * `getUserFriendlyDbError` shows it verbatim.
 */
export class DbError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DbError'
  }
}

/** The fields of a Postgres error that the app acts on. */
export type PostgresError = {
  code: string
  message: string
  details?: string
  constraint?: string
}

type ErrorFields = {
  code?: unknown
  message?: unknown
  detail?: unknown
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
 * wraps them in a DrizzleQueryError as `cause`.
 */
export function asDbError(err: unknown): PostgresError | null {
  const outer = fieldsOf(err)
  const source =
    typeof outer?.code === 'string' ? outer : fieldsOf(outer?.cause)
  if (!source || typeof source.code !== 'string') return null
  return {
    code: source.code,
    message: stringOr(source.message) ?? '',
    details: stringOr(source.detail),
    constraint: stringOr(source.constraint_name),
  }
}

function extractColumnFromDetail(details: string): string | null {
  const match = details.match(/Key \((\w+)\)/)
  return match ? match[1].replace(/_/g, ' ') : null
}

export function getUserFriendlyDbError(err: unknown, fallback: string): string {
  if (err instanceof DbError) return err.message

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
    default:
      return fallback
  }
}
