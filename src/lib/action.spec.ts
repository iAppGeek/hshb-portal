import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { notFound, redirect } from 'next/navigation'

import { getActor } from '@/auth/require'
import { logAuditEvent } from '@/db'

import { runAction, ActionError } from './action'

vi.mock('server-only', () => ({}))
vi.mock('@/auth/require', () => ({ getActor: vi.fn() }))
vi.mock('@/db', () => ({ logAuditEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Only `redirect` is faked, so a test can assert on the path without a real
// navigation. Everything else stays real — `unstable_rethrow` in particular,
// because it is what decides whether a framework interrupt escapes runAction.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  }),
}))

const mockGetActor = vi.mocked(getActor)
const mockAudit = vi.mocked(logAuditEvent)
const mockRevalidate = vi.mocked(revalidatePath)
const mockRedirect = vi.mocked(redirect)

const ADMIN = {
  staffId: 'staff-1',
  role: 'admin' as const,
  name: 'Ada',
  email: 'ada@example.com',
}

function formData(fields: Record<string, string | string[]> = {}): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((v) => fd.append(key, v))
    else fd.set(key, value)
  }
  return fd
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  mockGetActor.mockResolvedValue(ADMIN)
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

// ─── 1. Authentication ───────────────────────────────────────────────────────

describe('runAction — authentication', () => {
  it('returns Not authenticated when there is no actor', async () => {
    mockGetActor.mockResolvedValue(null)
    const run = vi.fn()

    const result = await runAction({
      name: 'test.action',
      formData: formData(),
      run,
      fallbackError: 'Failed.',
    })

    expect(result).toEqual({ error: 'Not authenticated' })
    expect(run).not.toHaveBeenCalled()
  })

  it('runs for any signed-in staff member when no permission is given', async () => {
    mockGetActor.mockResolvedValue({ ...ADMIN, role: 'teacher' })
    const run = vi.fn().mockResolvedValue(undefined)

    const result = await runAction({
      name: 'test.action',
      formData: formData(),
      run,
      fallbackError: 'Failed.',
    })

    expect(result).toBeUndefined()
    expect(run).toHaveBeenCalledOnce()
  })
})

// ─── 2. Permission ───────────────────────────────────────────────────────────

describe('runAction — permission', () => {
  it('returns Not authorised when the permission check fails', async () => {
    mockGetActor.mockResolvedValue({ ...ADMIN, role: 'teacher' })
    const run = vi.fn()

    const result = await runAction({
      name: 'test.action',
      permission: (role) => role === 'admin',
      formData: formData(),
      run,
      fallbackError: 'Failed.',
    })

    expect(result).toEqual({ error: 'Not authorised' })
    expect(run).not.toHaveBeenCalled()
  })

  it('passes the actor role to the permission check', async () => {
    const permission = vi.fn().mockReturnValue(true)

    await runAction({
      name: 'test.action',
      permission,
      formData: formData(),
      run: vi.fn().mockResolvedValue(undefined),
      fallbackError: 'Failed.',
    })

    expect(permission).toHaveBeenCalledWith('admin')
  })
})

// ─── 3. Schema parsing ───────────────────────────────────────────────────────

describe('runAction — schema', () => {
  const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email'),
  })

  it('passes the parsed input to run', async () => {
    const run = vi.fn().mockResolvedValue(undefined)

    await runAction({
      name: 'test.action',
      schema,
      formData: formData({ name: 'Ada', email: 'ada@example.com' }),
      run,
      fallbackError: 'Failed.',
    })

    expect(run).toHaveBeenCalledWith(
      { name: 'Ada', email: 'ada@example.com' },
      expect.objectContaining({ actor: ADMIN }),
    )
  })

  it('returns the first issue message and fieldErrors on a parse failure', async () => {
    const run = vi.fn()

    const result = await runAction({
      name: 'test.action',
      schema,
      formData: formData({ name: '', email: 'nope' }),
      run,
      fallbackError: 'Failed.',
    })

    expect(result).toEqual({
      error: 'Name is required',
      fieldErrors: { name: 'Name is required', email: 'Invalid email' },
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('keeps only the first message per field', async () => {
    const multi = z.object({
      code: z.string().min(3, 'Too short').regex(/^\d+$/, 'Digits only'),
    })

    const result = await runAction({
      name: 'test.action',
      schema: multi,
      formData: formData({ code: 'a' }),
      run: vi.fn(),
      fallbackError: 'Failed.',
    })

    expect(result).toEqual({
      error: 'Too short',
      fieldErrors: { code: 'Too short' },
    })
  })

  it('omits fieldErrors for a form-level issue', async () => {
    const formLevel = z
      .object({ a: z.string(), b: z.string() })
      .refine((d) => d.a === d.b, { message: 'Values must match' })

    const result = await runAction({
      name: 'test.action',
      schema: formLevel,
      formData: formData({ a: 'x', b: 'y' }),
      run: vi.fn(),
      fallbackError: 'Failed.',
    })

    expect(result).toEqual({ error: 'Values must match' })
  })

  it('collects repeated fields listed in arrayFields', async () => {
    const arraySchema = z.object({ class_ids: z.array(z.string()) })
    const run = vi.fn().mockResolvedValue(undefined)

    await runAction({
      name: 'test.action',
      schema: arraySchema,
      arrayFields: ['class_ids'],
      formData: formData({ class_ids: ['a', 'b'] }),
      run,
      fallbackError: 'Failed.',
    })

    expect(run).toHaveBeenCalledWith(
      { class_ids: ['a', 'b'] },
      expect.anything(),
    )
  })

  it('passes undefined as input when no schema is given', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const fd = formData({ anything: 'goes' })

    await runAction({
      name: 'test.action',
      formData: fd,
      run,
      fallbackError: 'Failed.',
    })

    expect(run).toHaveBeenCalledWith(undefined, { actor: ADMIN, formData: fd })
  })
})

// ─── 4. Errors thrown by run ─────────────────────────────────────────────────

describe('runAction — errors from run', () => {
  it('maps a Postgres error to a friendly message and logs it', async () => {
    const pgError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      details: 'Key (student_code)=(S001) already exists.',
    }

    const result = await runAction({
      name: 'students.save',
      formData: formData(),
      run: vi.fn().mockRejectedValue(pgError),
      fallbackError: 'Failed to save student. Please try again.',
    })

    expect(result).toEqual({
      error: 'A record with this student code already exists.',
    })
    expect(consoleError).toHaveBeenCalledWith(
      '[students.save]',
      expect.objectContaining({ code: '23505' }),
    )
  })

  it('falls back to fallbackError for an unmapped error', async () => {
    const result = await runAction({
      name: 'students.save',
      formData: formData(),
      run: vi.fn().mockRejectedValue(new Error('boom')),
      fallbackError: 'Failed to save student. Please try again.',
    })

    expect(result).toEqual({
      error: 'Failed to save student. Please try again.',
    })
    expect(consoleError).toHaveBeenCalledOnce()
  })

  it('returns an ActionError message verbatim without logging', async () => {
    const result = await runAction({
      name: 'students.save',
      formData: formData(),
      run: vi.fn().mockRejectedValue(new ActionError('Pick a guardian first')),
      fallbackError: 'Failed to save student. Please try again.',
    })

    expect(result).toEqual({ error: 'Pick a guardian first' })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('does not audit, revalidate or redirect when run throws', async () => {
    await runAction({
      name: 'students.save',
      formData: formData(),
      run: vi.fn().mockRejectedValue(new Error('boom')),
      audit: { entity: 'student', action: 'update' },
      revalidate: ['/students'],
      redirectTo: '/students',
      fallbackError: 'Failed.',
    })

    expect(mockAudit).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

// ─── 4b. Framework interrupts thrown by run ──────────────────────────────────

describe('runAction — framework interrupts from run', () => {
  it('lets a notFound() interrupt through instead of reporting a failed save', async () => {
    await expect(
      runAction({
        name: 'students.save',
        formData: formData(),
        run: async () => {
          notFound()
        },
        fallbackError: 'Failed to save student. Please try again.',
      }),
    ).rejects.toThrow()

    expect(consoleError).not.toHaveBeenCalled()
  })

  it('lets a redirect() called inside run through', async () => {
    // The real redirect, not the module-level fake: only an error carrying a
    // genuine NEXT_REDIRECT digest proves unstable_rethrow recognises it.
    const { redirect: realRedirect } =
      await vi.importActual<typeof import('next/navigation')>('next/navigation')

    await expect(
      runAction({
        name: 'students.save',
        formData: formData(),
        run: async () => {
          realRedirect('/students')
        },
        fallbackError: 'Failed to save student. Please try again.',
      }),
    ).rejects.toThrow()

    expect(consoleError).not.toHaveBeenCalled()
  })

  it('does not audit or revalidate when run is interrupted', async () => {
    await expect(
      runAction({
        name: 'students.save',
        formData: formData(),
        run: async () => {
          notFound()
        },
        audit: { entity: 'student', action: 'update' },
        revalidate: ['/students'],
        fallbackError: 'Failed.',
      }),
    ).rejects.toThrow()

    expect(mockAudit).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })
})

// ─── 5. Audit ────────────────────────────────────────────────────────────────

describe('runAction — audit', () => {
  const schema = z.object({ name: z.string() })

  it('defaults details to the parsed input', async () => {
    await runAction({
      name: 'students.save',
      schema,
      formData: formData({ name: 'Ada' }),
      run: vi.fn().mockResolvedValue(undefined),
      audit: { entity: 'student', action: 'update' },
      fallbackError: 'Failed.',
    })

    expect(mockAudit).toHaveBeenCalledWith({
      staffId: 'staff-1',
      action: 'update',
      entity: 'student',
      entityId: undefined,
      details: { name: 'Ada' },
    })
  })

  it('derives entityId and details from the result and the input', async () => {
    await runAction({
      name: 'students.create',
      schema,
      formData: formData({ name: 'Ada' }),
      run: vi.fn().mockResolvedValue({ id: 'student-9' }),
      audit: {
        entity: 'student',
        action: 'create',
        entityId: (result: { id: string }) => result.id,
        details: (result: { id: string }, input) => ({
          created: result.id,
          name: input.name,
        }),
      },
      fallbackError: 'Failed.',
    })

    expect(mockAudit).toHaveBeenCalledWith({
      staffId: 'staff-1',
      action: 'create',
      entity: 'student',
      entityId: 'student-9',
      details: { created: 'student-9', name: 'Ada' },
    })
  })

  it('redacts the listed fields', async () => {
    const payrollSchema = z.object({
      bank_sort_code: z.string(),
      payroll_ref: z.string(),
    })

    await runAction({
      name: 'hr.payroll',
      schema: payrollSchema,
      formData: formData({ bank_sort_code: '123456', payroll_ref: 'R1' }),
      run: vi.fn().mockResolvedValue(undefined),
      audit: {
        entity: 'staff_payroll',
        action: 'update',
        redact: ['bank_sort_code'],
      },
      fallbackError: 'Failed.',
    })

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { bank_sort_code: '[changed]', payroll_ref: 'R1' },
      }),
    )
  })

  it('omits details when there is no schema and no details function', async () => {
    await runAction({
      name: 'test.action',
      formData: formData(),
      run: vi.fn().mockResolvedValue(undefined),
      audit: { entity: 'cache', action: 'update' },
      fallbackError: 'Failed.',
    })

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ details: undefined }),
    )
  })

  it('does not write an audit entry when audit is omitted', async () => {
    await runAction({
      name: 'test.action',
      formData: formData(),
      run: vi.fn().mockResolvedValue(undefined),
      fallbackError: 'Failed.',
    })

    expect(mockAudit).not.toHaveBeenCalled()
  })
})

// ─── 6. Revalidate ───────────────────────────────────────────────────────────

describe('runAction — revalidate', () => {
  it('revalidates every listed path after success', async () => {
    await runAction({
      name: 'test.action',
      formData: formData(),
      run: vi.fn().mockResolvedValue(undefined),
      revalidate: ['/students', '/dashboard'],
      fallbackError: 'Failed.',
    })

    expect(mockRevalidate).toHaveBeenCalledWith('/students')
    expect(mockRevalidate).toHaveBeenCalledWith('/dashboard')
    expect(mockRevalidate).toHaveBeenCalledTimes(2)
  })
})

// ─── 7. Redirect ─────────────────────────────────────────────────────────────

describe('runAction — redirect', () => {
  it('redirects to a static path after success', async () => {
    await expect(
      runAction({
        name: 'test.action',
        formData: formData(),
        run: vi.fn().mockResolvedValue(undefined),
        redirectTo: '/students',
        fallbackError: 'Failed.',
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/students')

    expect(mockRedirect).toHaveBeenCalledWith('/students')
  })

  it('derives the redirect path from the result', async () => {
    await expect(
      runAction({
        name: 'test.action',
        formData: formData(),
        run: vi.fn().mockResolvedValue({ id: 'student-9' }),
        redirectTo: (result: { id: string }) => `/students/${result.id}`,
        fallbackError: 'Failed.',
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/students/student-9')
  })

  it('redirects after the audit entry and the revalidations', async () => {
    await expect(
      runAction({
        name: 'test.action',
        formData: formData(),
        run: vi.fn().mockResolvedValue(undefined),
        audit: { entity: 'student', action: 'update' },
        revalidate: ['/students'],
        redirectTo: '/students',
        fallbackError: 'Failed.',
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/students')

    expect(mockAudit).toHaveBeenCalledOnce()
    expect(mockRevalidate).toHaveBeenCalledWith('/students')
  })

  it('does not swallow the NEXT_REDIRECT as a run error', async () => {
    await expect(
      runAction({
        name: 'test.action',
        formData: formData(),
        run: vi.fn().mockResolvedValue(undefined),
        redirectTo: '/students',
        fallbackError: 'Failed.',
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/students')

    expect(consoleError).not.toHaveBeenCalled()
  })
})

// ─── 8. Success with no redirect ─────────────────────────────────────────────

describe('runAction — success', () => {
  it('returns undefined when there is nothing to redirect to', async () => {
    const result = await runAction({
      name: 'test.action',
      formData: formData(),
      run: vi.fn().mockResolvedValue({ id: 'x' }),
      fallbackError: 'Failed.',
    })

    expect(result).toBeUndefined()
  })
})

// ─── public: true ────────────────────────────────────────────────────────────

describe('runAction — public', () => {
  it('skips the session check and passes a null actor', async () => {
    mockGetActor.mockResolvedValue(null)
    const run = vi.fn().mockResolvedValue(undefined)
    const fd = formData()

    const result = await runAction({
      name: 'register.submit',
      public: true,
      formData: fd,
      run,
      fallbackError: 'Failed.',
    })

    expect(result).toBeUndefined()
    expect(mockGetActor).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledWith(undefined, { actor: null, formData: fd })
  })

  it('writes audit entries with a null staffId', async () => {
    await runAction({
      name: 'register.submit',
      public: true,
      formData: formData(),
      run: vi.fn().mockResolvedValue({ id: 'sub-1' }),
      audit: {
        entity: 'registration_submission',
        action: 'registration_submitted',
        entityId: (result: { id: string }) => result.id,
      },
      fallbackError: 'Failed.',
    })

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: null, entityId: 'sub-1' }),
    )
  })

  it('still maps thrown errors and ActionError the same way', async () => {
    const result = await runAction({
      name: 'register.submit',
      public: true,
      formData: formData(),
      run: vi.fn().mockRejectedValue(new ActionError('Verification failed.')),
      fallbackError: 'Failed.',
    })

    expect(result).toEqual({ error: 'Verification failed.' })
  })
})
