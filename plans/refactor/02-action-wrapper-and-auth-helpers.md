# 02 — Action wrapper and auth helpers

| Delivers              | Cx  | Reuse | Arch | Size | Depends on |
| --------------------- | :-: | :---: | :--: | :--: | ---------- |
| A1, A5, D6, F1 (part) |  9  |   9   |  7   |  M   | —          |

## Goal

Replace 72 hand-rolled `await auth()` checks and ~25 copies of the same server-action skeleton
(auth → role → parse → try/db/audit/revalidate/catch → redirect) with two small, typed helpers:

- `requireSession()` / `requireRole()` for pages.
- `runAction()` for server actions — owns auth, permission, Zod parsing, error mapping, logging,
  audit logging and redirect.

No user-visible behaviour changes. Existing error strings (`'Not authenticated'`, `'Not authorised'`)
are preserved exactly because E2E tests and dialogs match on them.

## Decisions already made

- Files: `src/auth/require.ts`, `src/lib/action.ts`, `src/lib/log.ts`.
- `ActionResult` moves from `src/lib/schemas.ts` to `src/lib/action.ts` and gains an optional
  `fieldErrors` (populated here; rendered by plan 04). `src/lib/schemas.ts` re-exports it for one
  release so nothing else needs to change in this plan.
- Actions keep their current exported signatures (`updateStudentAction(id, formData)` etc.) —
  `runAction` is **called inside** each exported function, not used as a factory. Client code is
  untouched.
- Pages that currently have no session check (dashboard, students, attendance) get
  `requireSession()`; behaviour is identical because the proxy already redirects.
- `revalidatePath` calls are preserved in this plan via the `revalidate` option (plan 03 removes
  them). Push sends in `attendance/actions.ts` stay where they are (plan 12 moves them).

## API

```ts
// src/auth/require.ts  (server-only)
import 'server-only'
export type Actor = {
  staffId: string
  role: StaffRole
  name: string | null
  email: string
}
/** Redirects to /login when there is no session or the session has no staffId. */
export async function requireSession(): Promise<Actor>
/** requireSession, then redirect('/dashboard') if `check(role)` is false. */
export async function requireRole(
  check: (role: StaffRole) => boolean,
): Promise<Actor>
/** For server actions: returns null instead of redirecting. */
export async function getActor(): Promise<Actor | null>
```

```ts
// src/lib/log.ts
export function logError(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>,
): void
// console.error(`[${scope}]`, { message, code?, details?, ...context }) — single line, no duplicate
// logging elsewhere. getUserFriendlyDbError stops logging.
```

```ts
// src/lib/action.ts  (server-only)
import 'server-only'
export type ActionResult = {
  error: string
  fieldErrors?: Record<string, string>
} | void

export type ActionContext = { actor: Actor; formData: FormData }

export type RunActionOptions<TInput, TResult> = {
  /** Used in logs, e.g. 'students.save'. */
  name: string
  /** Omit = any signed-in staff member. */
  permission?: (role: StaffRole) => boolean
  /** Parsed from `formData` with extractFormFields(formData, arrayFields). */
  schema?: z.ZodType<TInput>
  arrayFields?: string[]
  formData: FormData
  /** Domain logic. Throw to report a DB/user error; return to succeed. */
  run: (input: TInput, ctx: ActionContext) => Promise<TResult>
  /** Written after `run` resolves. `details` defaults to `input` (redacted). */
  audit?: {
    entity: string
    action: AuditAction
    entityId?: (result: TResult, input: TInput) => string | undefined
    details?: (result: TResult, input: TInput) => Record<string, unknown>
    /** Field names replaced with '[changed]'/'[unchanged]' via redactChanges. */
    redact?: string[]
  }
  /** Paths passed to revalidatePath after success. Removed in plan 03. */
  revalidate?: string[]
  /** Static path or derived from the result. Executed outside try/catch. */
  redirectTo?: string | ((result: TResult) => string)
  /** Message when the thrown error has no friendly mapping. */
  fallbackError: string
}

export async function runAction<TInput = undefined, TResult = void>(
  opts: RunActionOptions<TInput, TResult>,
): Promise<ActionResult>
```

Behaviour of `runAction`, in order:

1. `const actor = await getActor()`; if null → `return { error: 'Not authenticated' }`.
2. If `permission` given and `!permission(actor.role)` → `return { error: 'Not authorised' }`.
3. If `schema` given: `schema.safeParse(extractFormFields(formData, arrayFields))`. On failure
   return `{ error: firstIssue.message, fieldErrors }` where `fieldErrors` is built from
   `z.flattenError(error).fieldErrors` taking the first message per field. If no schema, `input`
   is `undefined`.
4. `try { result = await run(input, { actor, formData }) } catch (err) { logError(name, err); return { error: getUserFriendlyDbError(err, fallbackError) } }`.
5. If `audit`: call `logAuditEvent({ staffId: actor.staffId, action, entity, entityId, details })`
   where `details` = `audit.details?.(result, input) ?? input`, then `redactChanges(details, null,
audit.redact ?? [])` if `redact` is non-empty. Keep `logAuditEvent` fire-and-forget as today.
6. If `revalidate`: `revalidatePath(p)` for each.
7. If `redirectTo`: compute the path, then `redirect(path)` **after** the try/catch (it throws
   `NEXT_REDIRECT`).
8. Otherwise return `undefined`.

Actions that need custom parsing beyond one schema (student guardians, attendance records) omit
`schema` and parse inside `run` using `ctx.formData`; on validation failure they throw
`new ActionError('message')`, a tiny class exported from `src/lib/action.ts` that `runAction` maps
to `{ error: message }` without logging.

## Implementation steps

1. Create `src/lib/log.ts`, `src/auth/require.ts`, `src/lib/action.ts` as specified. Remove the
   `console.error` from `getUserFriendlyDbError`.
2. Move `AuditAction` and `AuditEntry` types to `src/db/audit-log.ts` exports (they already live
   there; export them).
3. Convert every `actions.ts` under `src/app` to `runAction`. Files (20):
   `students/new`, `students/[id]/edit`, `staff/new`, `staff/[id]/edit`, `classes/new`,
   `classes/[id]/edit`, `guardians/[id]/edit`, `incidents`, `lesson-plans`, `attendance`,
   `staff-attendance`, `registrations`, `registrations/photo-opt-out-actions`, `register`,
   `register/photo-opt-out`, `finance/fee-plans`, `finance/students/[id]`, `hr/staff/[id]`,
   `admin/_tabs/academic-years`, `admin/_tabs/class-migration`, plus `src/app/actions.ts`
   (`revalidateAllCaches` — wrap with `runAction` too; plan 03 deletes it).
   - Preserve each action's current `permission`, redirect target, revalidate paths, audit entity
     and action names exactly. List them in a table in the PR description.
   - `createIncidentAction` currently checks only the session; keep that (no behaviour change) but
     add a `// TODO(plan-05): align with canEditIncidents` comment.
   - The public `/register` actions have no session. Give `runAction` an option
     `public: true` that skips steps 1–2 and sets `actor` to `null` (type `ActionContext.actor:
Actor | null` only when `public`). Turnstile verification stays inside `run`.
   - `hr/staff/[id]/actions.ts` uses `redactChanges` with previous values; keep that by computing
     `details` in `audit.details` (previous row is fetched inside `run` and returned).
4. Convert every `page.tsx` that calls `auth()`:
   - `if (!session) redirect('/login')` → `const actor = await requireSession()`.
   - `if (!role || !canX(role)) redirect('/dashboard')` → `const actor = await requireRole(canX)`.
   - Pages that redirect to a list on missing permission (e.g. `students/new` → `/students`) keep
     that behaviour: `requireSession()` then the existing `if (!canX(actor.role)) redirect(...)`.
     Plan 06 normalises these.
   - Replace `session?.user?.role as StaffRole` and `staffId!` with `actor.role` / `actor.staffId`.
   - `src/app/layout.tsx` and `src/app/login/page.tsx` keep calling `auth()` directly (they render
     differently for signed-out users).
5. `src/app/api/push/subscribe/route.ts`: use `getActor()`; return 401 when null.
6. Tests:
   - Add `src/lib/action.spec.ts` covering steps 1–8 (not authenticated, not authorised, schema
     failure with `fieldErrors`, `run` throwing a PG error → friendly message, `ActionError`,
     audit call shape, redirect after success, `public: true`).
   - Add `src/auth/require.spec.ts`.
   - Update every `actions.spec.ts`: they mock `@/auth` — change the mock to `@/auth/require`'s
     `getActor`. Keep assertions on **outcomes** (db function called with X, returned `{ error }`,
     `redirect` called with Y). Delete assertions that only check the order of `auth()` calls.
   - `src/security.spec.ts` "Server actions call `await auth()`" → replace with: every
     `'use server'` file outside `src/app/register/**` imports `runAction` from `@/lib/action`, and
     every non-public `runAction` call does not pass `public: true`. Keep the other checks.
7. Update `src/lib/PERMISSIONS.md`'s "Every server action must call `await auth()`" note to
   describe `runAction`.

## Files

**Create:** `src/auth/require.ts`, `src/auth/require.spec.ts`, `src/lib/action.ts`,
`src/lib/action.spec.ts`, `src/lib/log.ts`.
**Modify:** all 21 `actions.ts`, all `page.tsx` with `auth()`, `src/app/api/push/subscribe/route.ts`,
`src/lib/db-error.ts`, `src/lib/schemas.ts` (re-export `ActionResult`), `src/db/audit-log.ts`,
`src/security.spec.ts`, `src/lib/PERMISSIONS.md`, all `actions.spec.ts`.
**Delete:** nothing yet.

## Acceptance criteria

- `rg "await auth\(\)" src --glob '!*.spec.*'` returns only `src/auth/require.ts`,
  `src/app/layout.tsx`, `src/app/login/page.tsx`.
- `rg "'Not authenticated'|'Not authorised'" src --glob '!*.spec.*'` returns only
  `src/lib/action.ts`.
- `rg "console\.error" src --glob '!*.spec.*'` returns only `src/lib/log.ts` and
  `src/db/audit-log.ts`.
- Every `actions.ts` is shorter than before; the PR lists before/after line counts.
- All existing E2E tests pass unchanged (they exercise the preserved error strings and redirects).
- `npm run pipeline:check` green; coverage not lower.

## Deliberate UX changes

None.
