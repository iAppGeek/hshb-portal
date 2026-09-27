import { asDbError } from './db-error'

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const { message } = err
    if (typeof message === 'string') return message
  }
  return String(err)
}

/**
 * The single place errors are written to the console. Callers pass a scope
 * (`'students.save'`) rather than logging at the throw site, so an error is
 * recorded exactly once with the context that identifies it.
 *
 * A database error is logged as Postgres reported it (code, message, detail).
 * Drizzle's wrapper is not: its message embeds the query's parameter values,
 * which can include personal or bank details.
 */
export function logError(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const dbError = asDbError(err)
  const payload: Record<string, unknown> = dbError
    ? { message: dbError.message, code: dbError.code }
    : { message: messageOf(err) }
  if (dbError?.details !== undefined) payload.details = dbError.details
  if (dbError?.constraint !== undefined) payload.constraint = dbError.constraint
  console.error(`[${scope}]`, { ...payload, ...context })
}
