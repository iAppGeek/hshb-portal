import 'server-only'

import { eq, inArray } from 'drizzle-orm'

import { NOTIFICATION_ROLES } from '@/lib/permissions'

import { toCamel, toSnake, type Snake } from './casing'
import { db } from './client'
import {
  pushSubscriptions,
  staff,
  type NewPushSubscription,
  type PushSubscription,
} from './schema'

export type PushSubscriptionRow = Snake<PushSubscription>

export type SavePushSubscriptionInput = Snake<NewPushSubscription>

/** Saves a browser's subscription, replacing any earlier one for the same endpoint. */
export async function savePushSubscription(
  input: SavePushSubscriptionInput,
): Promise<void> {
  const values = toCamel(input)
  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        staffId: values.staffId,
        p256dh: values.p256dh,
        auth: values.auth,
      },
    })
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
}

export async function pushSubscriptionExists(
  endpoint: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
  return rows.length > 0
}

/** Subscriptions of the staff who get admin notifications. */
export async function getAdminSubscriptions(): Promise<PushSubscriptionRow[]> {
  const rows = await db
    .select({
      id: pushSubscriptions.id,
      staffId: pushSubscriptions.staffId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      createdAt: pushSubscriptions.createdAt,
    })
    .from(pushSubscriptions)
    .innerJoin(staff, eq(staff.id, pushSubscriptions.staffId))
    .where(inArray(staff.role, NOTIFICATION_ROLES))
  return toSnake(rows)
}
