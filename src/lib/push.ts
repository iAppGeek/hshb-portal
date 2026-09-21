import 'server-only'

import webpush from 'web-push'

import type { PushSubscriptionRow } from '@/db'
import { env } from '@/env'
import { env as serverEnv } from '@/env.server'

export type AttendancePushPayload = {
  title: string
  body: string
  data: { url: string }
}

export async function sendPushNotification(
  subscription: PushSubscriptionRow,
  payload: AttendancePushPayload,
): Promise<void> {
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
    // Passed per send rather than via setVapidDetails, which validates the
    // keys when this module is imported.
    {
      vapidDetails: {
        subject: serverEnv.VAPID_SUBJECT,
        publicKey: env.client.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        privateKey: serverEnv.VAPID_PRIVATE_KEY,
      },
    },
  )
}
