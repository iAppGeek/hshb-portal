import 'server-only'

import { redirect, unstable_rethrow } from 'next/navigation'
import { z } from 'zod'

import type { Actor } from '@/auth/require'
import { getActor } from '@/auth/require'
import { logAuditEvent } from '@/db'
import type { AuditAction } from '@/db'
import type { StaffRole } from '@/types/next-auth'

import { redactChanges } from './audit-redaction'
import { getUserFriendlyDbError } from './db-error'
import { logError } from './log'
import { extractFormFields } from './schemas'

export type ActionResult<T = void> =
  | {
      error: string
      fieldErrors?: Record<string, string>
    }
  // `runAction` never resolves a `data` payload today (it only redirects or
  // returns void on success), so the branch collapses away for the default
  // `T = void` that every existing action is typed with. It exists purely so
  // `useServerForm<T>`'s `action` parameter type-checks against a future
  // action that resolves `{ data: T }` on success without a redirect.
  | (T extends void ? void : { data: T })

export type ActionContext<TActor extends Actor | null = Actor> = {
  actor: TActor
  formData: FormData
}

/**
 * Thrown from `run` to report a message straight back to the form. Unlike a
 * database error it is an expected outcome, so `runAction` neither logs it nor
 * puts it through `getUserFriendlyDbError`.
 */
export class ActionError extends Error {
  fieldErrors?: Record<string, string>

  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message)
    this.name = 'ActionError'
    this.fieldErrors = fieldErrors
  }
}

type AuditOptions<TInput, TResult> = {
  entity: string
  /**
   * A function when the name depends on what happened — an upsert records
   * 'create' or 'update' according to whether a row already existed.
   */
  action: AuditAction | ((result: TResult, input: TInput) => AuditAction)
  entityId?: (result: TResult, input: TInput) => string | undefined
  details?: (result: TResult, input: TInput) => Record<string, unknown>
  /** Field names replaced with '[changed]'/'[unchanged]' via redactChanges. */
  redact?: string[]
}

type BaseRunActionOptions<TInput, TResult, TActor extends Actor | null> = {
  /** Used in logs, e.g. 'students.save'. */
  name: string
  /** Parsed from `formData` with extractFormFields(formData, arrayFields). */
  schema?: z.ZodType<TInput>
  arrayFields?: string[]
  formData: FormData
  /** Domain logic. Throw to report a DB/user error; return to succeed. */
  run: (input: TInput, ctx: ActionContext<TActor>) => Promise<TResult>
  /** Written after `run` resolves. `details` defaults to `input` (redacted). */
  audit?: AuditOptions<TInput, TResult>
  /** Static path or derived from the result. Executed outside try/catch. */
  redirectTo?: string | ((result: TResult) => string)
  /** Message when the thrown error has no friendly mapping. */
  fallbackError: string
}

export type RunActionOptions<TInput, TResult> =
  | (BaseRunActionOptions<TInput, TResult, Actor> & {
      public?: false
      /** Omit = any signed-in staff member. */
      permission?: (role: StaffRole) => boolean
    })
  | (BaseRunActionOptions<TInput, TResult, null> & {
      /** Skips the session and permission checks; `ctx.actor` is null. */
      public: true
      permission?: never
    })

/**
 * Preserved verbatim: E2E tests and dialogs match on these strings. Exported so
 * that an action whose permission check needs the parsed input (and so cannot
 * use `permission`) can throw the same message.
 */
export const NOT_AUTHENTICATED = 'Not authenticated'
export const NOT_AUTHORISED = 'Not authorised'

/**
 * The first message per field, which is all the forms render. Exported so an
 * action that parses a sub-schema by hand inside `run` (a guardian block, a
 * per-row migration schema) can build the same `fieldErrors` shape to throw
 * with `ActionError`, prefixing paths to match the form field names.
 */
export function firstFieldErrors(error: z.ZodError): Record<string, string> {
  const flattened = z.flattenError(error).fieldErrors as Record<
    string,
    string[] | undefined
  >
  const result: Record<string, string> = {}
  for (const [field, messages] of Object.entries(flattened)) {
    const first = messages?.[0]
    if (first !== undefined) result[field] = first
  }
  return result
}

/** Prefixes every key of `fieldErrors`, e.g. for a guardian block parsed under `${prefix}_`. */
export function prefixFieldErrors(
  fieldErrors: Record<string, string>,
  prefix: string,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [field, message] of Object.entries(fieldErrors)) {
    result[`${prefix}_${field}`] = message
  }
  return result
}

export async function runAction<TInput = undefined, TResult = void>(
  opts: RunActionOptions<TInput, TResult>,
): Promise<ActionResult> {
  let actor: Actor | null = null

  if (!opts.public) {
    actor = await getActor()
    if (!actor) return { error: NOT_AUTHENTICATED }
    if (opts.permission && !opts.permission(actor.role))
      return { error: NOT_AUTHORISED }
  }

  let input = undefined as TInput
  if (opts.schema) {
    const parsed = opts.schema.safeParse(
      extractFormFields(opts.formData, opts.arrayFields),
    )
    if (!parsed.success) {
      const fieldErrors = firstFieldErrors(parsed.error)
      const error = parsed.error.issues[0].message
      return Object.keys(fieldErrors).length > 0
        ? { error, fieldErrors }
        : { error }
    }
    input = parsed.data
  }

  // The two option variants differ only in whether `actor` can be null, which
  // `public` already decided above.
  const run = opts.run as (
    input: TInput,
    ctx: ActionContext<Actor | null>,
  ) => Promise<TResult>

  let result: TResult
  try {
    result = await run(input, { actor, formData: opts.formData })
  } catch (err) {
    // redirect()/notFound() and friends throw framework interrupts that must
    // reach Next, not be reported to the form as a failed save.
    unstable_rethrow(err)
    if (err instanceof ActionError)
      return err.fieldErrors && Object.keys(err.fieldErrors).length > 0
        ? { error: err.message, fieldErrors: err.fieldErrors }
        : { error: err.message }
    logError(opts.name, err)
    return { error: getUserFriendlyDbError(err, opts.fallbackError) }
  }

  if (opts.audit) {
    const { entity, action, entityId, details, redact } = opts.audit
    const raw = details?.(result, input) ?? (input as unknown)
    const isRecord = typeof raw === 'object' && raw !== null
    const record = isRecord ? (raw as Record<string, unknown>) : undefined
    logAuditEvent({
      staffId: actor?.staffId ?? null,
      action: typeof action === 'function' ? action(result, input) : action,
      entity,
      entityId: entityId?.(result, input),
      details:
        record && redact && redact.length > 0
          ? redactChanges(record, null, redact)
          : record,
    })
  }

  if (opts.redirectTo) {
    const path =
      typeof opts.redirectTo === 'function'
        ? opts.redirectTo(result)
        : opts.redirectTo
    redirect(path)
  }

  return undefined
}
