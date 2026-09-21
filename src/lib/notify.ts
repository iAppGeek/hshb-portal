import 'server-only'

import {
  deletePushSubscription,
  getAdminSubscriptions,
  getSubscriptionsForStaff,
  type PushSubscriptionRow,
} from '@/db'
import { logError } from '@/lib/log'

export type Notification = {
  title: string
  body: string
  url: `/${string}`
}

function isStaleSubscription(err: unknown): boolean {
  return (
    err instanceof Error &&
    'statusCode' in err &&
    ((err as { statusCode: number }).statusCode === 410 ||
      (err as { statusCode: number }).statusCode === 404)
  )
}

async function sendToSubscriptions(
  subs: PushSubscriptionRow[],
  n: Notification,
): Promise<void> {
  const { sendPushNotification } = await import('@/lib/push')
  await Promise.allSettled(
    subs.map((sub) =>
      sendPushNotification(sub, {
        title: n.title,
        body: n.body,
        data: { url: n.url },
      }).catch((err: unknown) => {
        if (isStaleSubscription(err)) {
          return deletePushSubscription(sub.endpoint)
        }
        logError('notify', err)
      }),
    ),
  )
}

function fireAndForget(promise: Promise<void>): void {
  promise.catch((err) => logError('notify', err))
}

/** Fire-and-forget: never awaited by the caller, never throws. Removes 410/404 subscriptions. */
export function notifyAdmins(
  n: Notification,
  opts?: { excludeStaffId?: string },
): void {
  fireAndForget(
    getAdminSubscriptions().then((subs) => {
      const recipients = opts?.excludeStaffId
        ? subs.filter((sub) => sub.staff_id !== opts.excludeStaffId)
        : subs
      return sendToSubscriptions(recipients, n)
    }),
  )
}

export function notifyStaff(staffIds: string[], n: Notification): void {
  fireAndForget(
    getSubscriptionsForStaff(staffIds).then((subs) =>
      sendToSubscriptions(subs, n),
    ),
  )
}
