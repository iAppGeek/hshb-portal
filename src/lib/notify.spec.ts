import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  deletePushSubscription,
  getAdminSubscriptions,
  getSubscriptionsForStaff,
} from '@/db'
import { sendPushNotification } from '@/lib/push'

import { notifyAdmins, notifyStaff } from './notify'

vi.mock('@/db', () => ({
  getAdminSubscriptions: vi.fn(),
  getSubscriptionsForStaff: vi.fn(),
  deletePushSubscription: vi.fn(),
}))

vi.mock('@/lib/push', () => ({
  sendPushNotification: vi.fn(),
}))

const mockSub = {
  id: 'sub-1',
  staff_id: 'admin-1',
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  p256dh: 'p256dh-key',
  auth: 'auth-key',
  created_at: null,
}

const notification = {
  title: 'Test',
  body: 'Hello',
  url: '/reports' as const,
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('notifyAdmins', () => {
  it('sends to admin subscriptions', async () => {
    vi.mocked(getAdminSubscriptions).mockResolvedValue([mockSub])
    vi.mocked(sendPushNotification).mockResolvedValue(undefined)

    notifyAdmins(notification)
    await new Promise((r) => setTimeout(r, 0))

    expect(sendPushNotification).toHaveBeenCalledWith(mockSub, {
      title: 'Test',
      body: 'Hello',
      data: { url: '/reports' },
    })
  })

  it('excludes the actor when excludeStaffId is set', async () => {
    const actorSub = { ...mockSub, staff_id: 'actor-1' }
    vi.mocked(getAdminSubscriptions).mockResolvedValue([actorSub, mockSub])
    vi.mocked(sendPushNotification).mockResolvedValue(undefined)

    notifyAdmins(notification, { excludeStaffId: 'actor-1' })
    await new Promise((r) => setTimeout(r, 0))

    expect(sendPushNotification).toHaveBeenCalledOnce()
    expect(sendPushNotification).toHaveBeenCalledWith(
      mockSub,
      expect.anything(),
    )
  })

  it('deletes stale subscriptions on 410', async () => {
    vi.mocked(getAdminSubscriptions).mockResolvedValue([mockSub])
    vi.mocked(deletePushSubscription).mockResolvedValue(undefined)
    const goneError = Object.assign(new Error('Gone'), { statusCode: 410 })
    vi.mocked(sendPushNotification).mockRejectedValue(goneError)

    notifyAdmins(notification)
    await new Promise((r) => setTimeout(r, 0))

    expect(deletePushSubscription).toHaveBeenCalledWith(mockSub.endpoint)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('deletes stale subscriptions on 404', async () => {
    vi.mocked(getAdminSubscriptions).mockResolvedValue([mockSub])
    vi.mocked(deletePushSubscription).mockResolvedValue(undefined)
    const notFoundError = Object.assign(new Error('Not Found'), {
      statusCode: 404,
    })
    vi.mocked(sendPushNotification).mockRejectedValue(notFoundError)

    notifyAdmins(notification)
    await new Promise((r) => setTimeout(r, 0))

    expect(deletePushSubscription).toHaveBeenCalledWith(mockSub.endpoint)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('logs other push errors without throwing', async () => {
    vi.mocked(getAdminSubscriptions).mockResolvedValue([mockSub])
    vi.mocked(sendPushNotification).mockRejectedValue(
      new Error('Network error'),
    )

    expect(() => notifyAdmins(notification)).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))

    expect(consoleError).toHaveBeenCalledWith(
      '[notify]',
      expect.objectContaining({ message: 'Network error' }),
    )
  })

  it('never throws when fetching subscriptions fails', async () => {
    vi.mocked(getAdminSubscriptions).mockRejectedValue(new Error('DB down'))

    expect(() => notifyAdmins(notification)).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))

    expect(consoleError).toHaveBeenCalledWith(
      '[notify]',
      expect.objectContaining({ message: 'DB down' }),
    )
  })
})

describe('notifyStaff', () => {
  it('sends to subscriptions for the given staff ids', async () => {
    vi.mocked(getSubscriptionsForStaff).mockResolvedValue([mockSub])
    vi.mocked(sendPushNotification).mockResolvedValue(undefined)

    notifyStaff(['admin-1'], notification)
    await new Promise((r) => setTimeout(r, 0))

    expect(getSubscriptionsForStaff).toHaveBeenCalledWith(['admin-1'])
    expect(sendPushNotification).toHaveBeenCalledWith(
      mockSub,
      expect.objectContaining({ title: 'Test' }),
    )
  })
})
