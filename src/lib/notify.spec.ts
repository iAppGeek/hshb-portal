import { describe, it, expect, vi, beforeEach } from 'vitest'

import { deletePushSubscription, getAdminSubscriptions } from '@/db'
import { sendPushNotification } from '@/lib/push'

import { notifyAdmins } from './notify'

// `after()` needs a request scope; collect the callbacks so each test decides
// when the post-response work runs.
const scheduled = vi.hoisted(() => [] as Array<() => Promise<unknown>>)

vi.mock('next/server', () => ({
  after: (cb: () => Promise<unknown>) => {
    scheduled.push(cb)
  },
}))

vi.mock('@/db', () => ({
  getAdminSubscriptions: vi.fn(),
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

async function runScheduled(): Promise<void> {
  await Promise.all(scheduled.splice(0).map((cb) => cb()))
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  scheduled.length = 0
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('notifyAdmins', () => {
  it('defers sending until after the response', () => {
    notifyAdmins(notification)

    expect(scheduled).toHaveLength(1)
    expect(getAdminSubscriptions).not.toHaveBeenCalled()
  })

  it('sends to admin subscriptions', async () => {
    vi.mocked(getAdminSubscriptions).mockResolvedValue([mockSub])
    vi.mocked(sendPushNotification).mockResolvedValue(undefined)

    notifyAdmins(notification)
    await runScheduled()

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
    await runScheduled()

    expect(sendPushNotification).toHaveBeenCalledOnce()
    expect(sendPushNotification).toHaveBeenCalledWith(
      mockSub,
      expect.anything(),
    )
  })

  it.each([410, 404])(
    'deletes stale subscriptions on %i',
    async (statusCode) => {
      vi.mocked(getAdminSubscriptions).mockResolvedValue([mockSub])
      vi.mocked(deletePushSubscription).mockResolvedValue(undefined)
      vi.mocked(sendPushNotification).mockRejectedValue(
        Object.assign(new Error('Stale'), { statusCode }),
      )

      notifyAdmins(notification)
      await runScheduled()

      expect(deletePushSubscription).toHaveBeenCalledWith(mockSub.endpoint)
      expect(consoleError).not.toHaveBeenCalled()
    },
  )

  it('logs a failed stale-subscription delete without rejecting', async () => {
    vi.mocked(getAdminSubscriptions).mockResolvedValue([mockSub])
    vi.mocked(deletePushSubscription).mockRejectedValue(new Error('DB down'))
    vi.mocked(sendPushNotification).mockRejectedValue(
      Object.assign(new Error('Gone'), { statusCode: 410 }),
    )

    notifyAdmins(notification)
    await expect(runScheduled()).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledWith(
      '[notify]',
      expect.objectContaining({ message: 'DB down' }),
    )
  })

  it('logs other push errors without rejecting', async () => {
    vi.mocked(getAdminSubscriptions).mockResolvedValue([mockSub])
    vi.mocked(sendPushNotification).mockRejectedValue(
      Object.assign(new Error('Server error'), { statusCode: 500 }),
    )

    notifyAdmins(notification)
    await expect(runScheduled()).resolves.toBeUndefined()

    expect(deletePushSubscription).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith(
      '[notify]',
      expect.objectContaining({ message: 'Server error' }),
    )
  })

  it('logs and does not reject when fetching subscriptions fails', async () => {
    vi.mocked(getAdminSubscriptions).mockRejectedValue(new Error('DB down'))

    notifyAdmins(notification)
    await expect(runScheduled()).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledWith(
      '[notify]',
      expect.objectContaining({ message: 'DB down' }),
    )
  })
})
