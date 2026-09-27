import { eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { logAuditEvent } from './audit-log'
import { db } from './client'
import { auditLog } from './schema'
import { resetDatabase, SEED } from './test-db'

afterAll(resetDatabase)
afterEach(() => {
  vi.restoreAllMocks()
})

async function rowsFor(
  entityId: string,
): Promise<(typeof auditLog.$inferSelect)[]> {
  // The write is fire-and-forget, so poll briefly for it to land.
  for (let i = 0; i < 20; i++) {
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, entityId))
    if (rows.length > 0) return rows
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return []
}

describe('logAuditEvent', () => {
  it('writes the entry, details as jsonb', async () => {
    logAuditEvent({
      staffId: SEED.staff.admin,
      action: 'update',
      entity: 'student',
      entityId: 'audit-1',
      details: { changed: ['first_name'], nested: { keepCase: true } },
    })
    const [row] = await rowsFor('audit-1')
    expect(row).toMatchObject({
      staffId: SEED.staff.admin,
      action: 'update',
      entity: 'student',
      details: { changed: ['first_name'], nested: { keepCase: true } },
    })
  })

  it('stores null for a missing entity id, details or staff member', async () => {
    logAuditEvent({ staffId: null, action: 'sign_in', entity: 'session' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entity, 'session'))
    expect(rows).toEqual([
      expect.objectContaining({ staffId: null, entityId: null, details: null }),
    ])
  })

  it('logs a failed write instead of throwing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      logAuditEvent({
        staffId: '00000000-0000-0000-0000-0000000000ff', // no such staff: FK fails
        action: 'delete',
        entity: 'student',
        entityId: 'audit-fk',
      }),
    ).not.toThrow()
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(consoleError).toHaveBeenCalledWith(
      '[audit-log]',
      expect.objectContaining({ code: '23503' }),
    )
  })
})
