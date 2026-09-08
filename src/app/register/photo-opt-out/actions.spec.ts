import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { redirect } from 'next/navigation'

import { createPhotoOptOut, logAuditEvent } from '@/db'
import { getClientIp } from '@/lib/request-ip'
import { verifyTurnstileToken } from '@/lib/turnstile'

import { submitPhotoOptOutAction } from './actions'

vi.mock('@/db', () => ({
  createPhotoOptOut: vi.fn(),
  logAuditEvent: vi.fn(),
}))

vi.mock('@/lib/turnstile', () => ({
  verifyTurnstileToken: vi.fn(),
}))

vi.mock('@/lib/request-ip', () => ({
  getClientIp: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value)
  }
  return fd
}

const baseFields = {
  child_first_name: 'Alice',
  child_last_name: 'Student',
  date_of_birth: '2015-06-01',
  declaration_name: 'Gary AliceGuardian',
  notes: '',
  turnstile_token: 'test-token',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TURNSTILE_SECRET_KEY = 'test-secret'
  vi.mocked(verifyTurnstileToken).mockResolvedValue(true)
  vi.mocked(createPhotoOptOut).mockResolvedValue({ id: 'req-1' })
  vi.mocked(getClientIp).mockResolvedValue('203.0.113.1')
})

afterEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY
})

describe('submitPhotoOptOutAction', () => {
  it('returns an unavailable error when TURNSTILE_SECRET_KEY is missing', async () => {
    delete process.env.TURNSTILE_SECRET_KEY

    const result = await submitPhotoOptOutAction(makeFormData(baseFields))

    expect(result).toEqual({
      error: 'This form is temporarily unavailable. Please try again later.',
    })
    expect(createPhotoOptOut).not.toHaveBeenCalled()
  })

  it('returns the first zod validation error', async () => {
    const result = await submitPhotoOptOutAction(
      makeFormData({ ...baseFields, child_first_name: '' }),
    )

    expect(result?.error).toBeDefined()
    expect(createPhotoOptOut).not.toHaveBeenCalled()
  })

  it('returns a verification error and inserts nothing when Turnstile fails', async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValue(false)

    const result = await submitPhotoOptOutAction(makeFormData(baseFields))

    expect(result).toEqual({
      error: 'Verification failed. Please try again.',
    })
    expect(createPhotoOptOut).not.toHaveBeenCalled()
  })

  it('returns a friendly message when the db insert fails', async () => {
    vi.mocked(createPhotoOptOut).mockRejectedValue(new Error('insert failed'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await submitPhotoOptOutAction(makeFormData(baseFields))

    expect(result).toEqual({
      error: 'Failed to submit your request. Please try again.',
    })
    consoleSpy.mockRestore()
  })

  it('inserts the request, logs the audit event, and redirects on success', async () => {
    await submitPhotoOptOutAction(makeFormData(baseFields))

    expect(createPhotoOptOut).toHaveBeenCalledWith(
      expect.objectContaining({ child_first_name: 'Alice' }),
    )
    expect(createPhotoOptOut).toHaveBeenCalledWith(
      expect.not.objectContaining({ turnstile_token: expect.anything() }),
    )
    expect(logAuditEvent).toHaveBeenCalledWith({
      staffId: null,
      action: 'photo_opt_out_submitted',
      entity: 'photo_consent_opt_out',
      entityId: 'req-1',
    })
    expect(redirect).toHaveBeenCalledWith('/register/photo-opt-out/success')
  })

  it('verifies the Turnstile token with the client IP', async () => {
    await submitPhotoOptOutAction(makeFormData(baseFields))

    expect(verifyTurnstileToken).toHaveBeenCalledWith(
      'test-token',
      '203.0.113.1',
    )
  })
})
