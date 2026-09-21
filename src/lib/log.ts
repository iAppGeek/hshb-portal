type ErrorLike = {
  message?: unknown
  code?: unknown
  details?: unknown
}

function asErrorLike(err: unknown): ErrorLike {
  return typeof err === 'object' && err !== null ? (err as ErrorLike) : {}
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  const { message } = asErrorLike(err)
  if (typeof message === 'string') return message
  return String(err)
}

/**
 * The single place errors are written to the console. Callers pass a scope
 * (`'students.save'`) rather than logging at the throw site, so an error is
 * recorded exactly once with the context that identifies it.
 */
export function logError(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const { code, details } = asErrorLike(err)
  const payload: Record<string, unknown> = { message: messageOf(err) }
  if (code !== undefined) payload.code = code
  if (details !== undefined) payload.details = details
  console.error(`[${scope}]`, { ...payload, ...context })
}
