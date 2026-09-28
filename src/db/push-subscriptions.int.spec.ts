import { afterAll, describe, expect, it } from 'vitest'

import {
  deletePushSubscription,
  getAdminSubscriptions,
  pushSubscriptionExists,
  savePushSubscription,
} from './push-subscriptions'
import { resetDatabase, SEED } from './test-db'

afterAll(resetDatabase)

const sub = (endpoint: string, staffId: string, auth = 'a') => ({
  staff_id: staffId,
  endpoint,
  p256dh: 'p',
  auth,
})

describe('push subscriptions', () => {
  it('saves a subscription and reports that it exists', async () => {
    await savePushSubscription(sub('https://push/admin', SEED.staff.admin))
    expect(await pushSubscriptionExists('https://push/admin')).toBe(true)
    expect(await pushSubscriptionExists('https://push/none')).toBe(false)
  })

  it('re-saving an endpoint replaces the keys and owner', async () => {
    await savePushSubscription(
      sub('https://push/shared', SEED.staff.teacher, 'old'),
    )
    await savePushSubscription(
      sub('https://push/shared', SEED.staff.headteacher, 'new'),
    )
    const admins = await getAdminSubscriptions()
    expect(admins.find((s) => s.endpoint === 'https://push/shared')).toEqual({
      id: expect.any(String),
      staffId: SEED.staff.headteacher,
      endpoint: 'https://push/shared',
      p256dh: 'p',
      auth: 'new',
      createdAt: expect.any(String),
    })
  })

  it('lists only admin and headteacher subscriptions', async () => {
    await savePushSubscription(sub('https://push/teacher', SEED.staff.teacher))
    expect(
      (await getAdminSubscriptions()).map((s) => s.endpoint).sort(),
    ).toEqual(['https://push/admin', 'https://push/shared'])
  })

  it('deletes by endpoint', async () => {
    await deletePushSubscription('https://push/admin')
    expect(await pushSubscriptionExists('https://push/admin')).toBe(false)
  })
})
