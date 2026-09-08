import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { redirect } from 'next/navigation'

import { createRegistrationSubmission, logAuditEvent } from '@/db'
import { getClientIp } from '@/lib/request-ip'
import { verifyTurnstileToken } from '@/lib/turnstile'

import { submitRegistrationAction } from './actions'

vi.mock('@/db', () => ({
  createRegistrationSubmission: vi.fn(),
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
  child_first_name: 'Seed',
  child_last_name: 'Pending',
  date_of_birth: '2020-01-15',
  preferred_year_group: 'Year 1',
  address_line_1: '1 Seed St',
  address_line_2: '',
  city: 'London',
  postcode: 'N1 2AA',
  allergies: '',
  medical_details: '',
  collect_authorised: '',
  collect_password: '',
  has_secondary: 'false',
  has_contact1: 'false',
  has_contact2: 'false',
  consent_privacy_notice: 'on',
  consent_emergency_first_aid: 'on',
  consent_photo_media: 'on',
  consent_home_school: 'on',
  consent_comms_email_sms: 'on',
  declaration_name: 'Petra Pending',
  turnstile_token: 'test-token',
  primary_first_name: 'Petra',
  primary_last_name: 'Pending',
  primary_relationship: 'Mother',
  primary_phone: '07700 900000',
  primary_email: 'petra@example.com',
  primary_same_as_child_address: 'on',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TURNSTILE_SECRET_KEY = 'test-secret'
  vi.mocked(verifyTurnstileToken).mockResolvedValue(true)
  vi.mocked(createRegistrationSubmission).mockResolvedValue({ id: 'sub-1' })
  vi.mocked(getClientIp).mockResolvedValue('203.0.113.1')
})

afterEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY
})

describe('submitRegistrationAction', () => {
  it('returns an unavailable error when TURNSTILE_SECRET_KEY is missing', async () => {
    delete process.env.TURNSTILE_SECRET_KEY

    const result = await submitRegistrationAction(makeFormData(baseFields))

    expect(result).toEqual({
      error: 'Registration is temporarily unavailable. Please try again later.',
    })
    expect(createRegistrationSubmission).not.toHaveBeenCalled()
  })

  it('returns the first zod validation error', async () => {
    const result = await submitRegistrationAction(
      makeFormData({ ...baseFields, child_first_name: '' }),
    )

    expect(result?.error).toBeDefined()
    expect(createRegistrationSubmission).not.toHaveBeenCalled()
  })

  it('only parses optional contacts when their has_* flag is true', async () => {
    await submitRegistrationAction(
      makeFormData({
        ...baseFields,
        has_secondary: 'true',
        secondary_first_name: 'Gary',
        secondary_last_name: 'Guardian',
        secondary_phone: '07700 900001',
        secondary_same_as_child_address: 'on',
      }),
    )

    const call = vi.mocked(createRegistrationSubmission).mock.calls[0][0]
    expect(call.contacts).toHaveLength(2)
    expect(call.contacts.map((c) => c.contact_role)).toEqual([
      'primary',
      'secondary',
    ])
  })

  it('returns an error when an optional contact fails validation', async () => {
    const result = await submitRegistrationAction(
      makeFormData({
        ...baseFields,
        has_secondary: 'true',
        secondary_first_name: '',
      }),
    )

    expect(result?.error).toBeDefined()
    expect(createRegistrationSubmission).not.toHaveBeenCalled()
  })

  it('returns a verification error and inserts nothing when Turnstile fails', async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValue(false)

    const result = await submitRegistrationAction(makeFormData(baseFields))

    expect(result).toEqual({
      error: 'Verification failed. Please try again.',
    })
    expect(createRegistrationSubmission).not.toHaveBeenCalled()
  })

  it('returns a friendly message when the db insert fails', async () => {
    vi.mocked(createRegistrationSubmission).mockRejectedValue(
      new Error('insert failed'),
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await submitRegistrationAction(makeFormData(baseFields))

    expect(result).toEqual({
      error: 'Failed to submit registration. Please try again.',
    })
    consoleSpy.mockRestore()
  })

  it('inserts the submission, logs the audit event, and redirects on success', async () => {
    await submitRegistrationAction(makeFormData(baseFields))

    expect(createRegistrationSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        submission: expect.objectContaining({ child_first_name: 'Seed' }),
        contacts: [expect.objectContaining({ contact_role: 'primary' })],
      }),
    )
    expect(logAuditEvent).toHaveBeenCalledWith({
      staffId: null,
      action: 'registration_submitted',
      entity: 'registration_submission',
      entityId: 'sub-1',
    })
    expect(redirect).toHaveBeenCalledWith('/register/success')
  })

  it('verifies the Turnstile token with the client IP', async () => {
    await submitRegistrationAction(makeFormData(baseFields))

    expect(verifyTurnstileToken).toHaveBeenCalledWith(
      'test-token',
      '203.0.113.1',
    )
  })
})
