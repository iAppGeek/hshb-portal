import 'server-only'

import { revalidatePath } from 'next/cache'
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

export type ActionResult = {
  error: string
  fieldErrors?: Record<string, string>
} | void

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
  constructor(message: string) {
    super(message)
    this.name = 'ActionError'
  }
}

type AuditOptions<TInput, TResult> = {
  entity: string
  action: AuditAction
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
  /** Paths passed to revalidatePath after success. Removed in plan 03. */
  revalidate?: string[]
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

/** Preserved verbatim: E2E tests and dialogs match on these strings. */
const NOT_AUTHENTICATED = 'Not authenticated'
const NOT_AUTHORISED = 'Not authorised'

/** The first message per field, which is all the forms render. */
function firstFieldErrors(error: z.ZodError): Record<string, string> {
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
    if (err instanceof ActionError) return { error: err.message }
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
      action,
      entity,
      entityId: entityId?.(result, input),
      details:
        record && redact && redact.length > 0
          ? redactChanges(record, null, redact)
          : record,
    })
  }

  if (opts.revalidate) {
    for (const path of opts.revalidate) revalidatePath(path)
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
