import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendNotification = vi.hoisted(() => vi.fn())

vi.mock('web-push', () => ({
  default: {
    sendNotification: mockSendNotification,
  },
}))

vi.mock('@/db', () => ({}))

import { sendPushNotification } from './push'

beforeEach(() => {
  vi.clearAllMocks()
})

const mockSubscription = {
  id: 'sub-1',
  staff_id: 'staff-1',
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  p256dh: 'p256dh-key',
  auth: 'auth-key',
  created_at: '2024-03-08T10:00:00Z',
}

const mockPayload = {
  title: 'Attendance Saved',
  body: 'Attendance for Class A has been saved',
  data: { url: '/reports' },
}

describe('sendPushNotification', () => {
  it('calls webpush.sendNotification with the correct shape', async () => {
    mockSendNotification.mockResolvedValue({ statusCode: 201 })

    await sendPushNotification(mockSubscription, mockPayload)

    expect(mockSendNotification).toHaveBeenCalledWith(
      {
        endpoint: mockSubscription.endpoint,
        keys: { p256dh: mockSubscription.p256dh, auth: mockSubscription.auth },
      },
      JSON.stringify(mockPayload),
      {
        // From the environment: vitest.setup.ts only fills these in when CI
        // hasn't already set them.
        vapidDetails: {
          subject: process.env.VAPID_SUBJECT,
          publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
          privateKey: process.env.VAPID_PRIVATE_KEY,
        },
      },
    )
  })

  it('propagates error when sendNotification rejects', async () => {
    const error = Object.assign(new Error('Push failed'), { statusCode: 500 })
    mockSendNotification.mockRejectedValue(error)

    await expect(
      sendPushNotification(mockSubscription, mockPayload),
    ).rejects.toThrow('Push failed')
  })

  it('propagates 410 Gone error so caller can clean up stale subscriptions', async () => {
    const error = Object.assign(new Error('Gone'), { statusCode: 410 })
    mockSendNotification.mockRejectedValue(error)

    const caught = await sendPushNotification(
      mockSubscription,
      mockPayload,
    ).catch((e: unknown) => e)
    expect((caught as { statusCode: number }).statusCode).toBe(410)
  })
})
