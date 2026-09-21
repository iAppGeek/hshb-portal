import 'server-only'

import { after } from 'next/server'

import {
  deletePushSubscription,
  getAdminSubscriptions,
  type PushSubscriptionRow,
} from '@/db'
import { logError } from '@/lib/log'
import { sendPushNotification } from '@/lib/push'

export type Notification = {
  title: string
  body: string
  url: `/${string}`
}

function isStaleSubscription(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const code = (err as { statusCode?: unknown }).statusCode
  return code === 410 || code === 404
}

async function sendToSubscriptions(
  subs: PushSubscriptionRow[],
  n: Notification,
): Promise<void> {
  await Promise.allSettled(
    subs.map((sub) =>
      sendPushNotification(sub, {
        title: n.title,
        body: n.body,
        data: { url: n.url },
      }).catch((err: unknown) => {
        if (isStaleSubscription(err)) {
          return deletePushSubscription(sub.endpoint).catch((e: unknown) =>
            logError('notify', e),
          )
        }
        logError('notify', err)
      }),
    ),
  )
}

async function sendToAdmins(
  n: Notification,
  excludeStaffId: string | undefined,
): Promise<void> {
  try {
    const subs = await getAdminSubscriptions()
    const recipients = excludeStaffId
      ? subs.filter((sub) => sub.staff_id !== excludeStaffId)
      : subs
    await sendToSubscriptions(recipients, n)
  } catch (err) {
    logError('notify', err)
  }
}

/**
 * Sends once the response has gone, via `after()` so the platform keeps the
 * function alive until the pushes finish. Never throws; removes 410/404
 * subscriptions.
 */
export function notifyAdmins(
  n: Notification,
  opts?: { excludeStaffId?: string },
): void {
  after(() => sendToAdmins(n, opts?.excludeStaffId))
}
