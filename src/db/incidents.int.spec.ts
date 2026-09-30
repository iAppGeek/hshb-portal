import { afterAll, describe, expect, it } from 'vitest'

import { asDbError } from '@/lib/db-error'

import {
  createIncident,
  getIncidentById,
  getIncidentCount,
  getIncidentCountsByDateRange,
  getIncidents,
  updateIncident,
} from './incidents'
import { resetDatabase, SEED } from './test-db'

afterAll(resetDatabase)

describe('incident reads', () => {
  it('counts and lists incidents newest first, with people', async () => {
    expect(await getIncidentCount()).toBe(2)
    const incidents = await getIncidents()
    expect(incidents.map((i) => i.id)).toEqual([
      SEED.incidents.behaviour,
      SEED.incidents.medical,
    ])
    expect(incidents[0]).toMatchObject({
      type: 'behaviour',
      student: {
        id: SEED.students.bob,
        first_name: 'Bob',
        last_name: 'Student',
      },
      creator: {
        id: SEED.staff.teacher,
        first_name: 'Tom',
        last_name: 'Teacher',
      },
      updater: null,
      parent_notified: false,
      incident_date: expect.stringMatching(/T.*\+00:00$/),
    })
  })

  it('filters by type', async () => {
    expect(
      (await getIncidents({ type: 'behaviour' })).map((i) => i.id),
    ).toEqual([SEED.incidents.behaviour])
    expect(await getIncidents({ type: 'other' })).toEqual([])
  })

  it('with createdBy, matches the students OR what that staff member recorded', async () => {
    // Both seeded incidents were recorded by Tom.
    expect(
      (await getIncidents({ createdBy: SEED.staff.teacher })).map((i) => i.id),
    ).toEqual([SEED.incidents.behaviour, SEED.incidents.medical])
    expect(
      await getIncidents({ studentIds: [], createdBy: SEED.staff.teacher2 }),
    ).toEqual([])
    expect(
      (
        await getIncidents({
          studentIds: [SEED.students.alice],
          createdBy: SEED.staff.teacher2,
        })
      ).map((i) => i.id),
    ).toEqual([SEED.incidents.medical])
    expect(
      (
        await getIncidents({
          type: 'behaviour',
          studentIds: [SEED.students.alice],
          createdBy: SEED.staff.teacher,
        })
      ).map((i) => i.id),
    ).toEqual([SEED.incidents.behaviour])
  })

  it('filters by student and pages', async () => {
    expect(
      (await getIncidents({ studentIds: [SEED.students.alice] })).map(
        (i) => i.id,
      ),
    ).toEqual([SEED.incidents.medical])
    expect(
      (await getIncidents({ limit: 1, offset: 1 })).map((i) => i.id),
    ).toEqual([SEED.incidents.medical])
  })

  it('finds one by id, or null', async () => {
    expect((await getIncidentById(SEED.incidents.medical))?.title).toBe(
      'Allergic reaction',
    )
    expect(
      await getIncidentById('60000000-0000-0000-0000-0000000000ff'),
    ).toBeNull()
  })

  it('counts by type over a date range', async () => {
    expect(
      await getIncidentCountsByDateRange('2000-01-01', '2100-01-01'),
    ).toEqual({ medical: 1, behaviour: 1, other: 0, total: 2 })
    expect(
      await getIncidentCountsByDateRange('2000-01-01', '2000-12-31'),
    ).toEqual({ medical: 0, behaviour: 0, other: 0, total: 0 })
  })
})

describe('incident writes', () => {
  it('creates and updates, returning the full row', async () => {
    const created = await createIncident({
      type: 'other',
      student_id: SEED.students.carol,
      title: 'Lost coat',
      description: 'Left in the hall.',
      incident_date: '2026-09-20T10:00:00.000Z',
      created_by: SEED.staff.teacher2,
    })
    expect(created).toMatchObject({
      incident_date: '2026-09-20T10:00:00+00:00',
      student: { first_name: 'Carol' },
      creator: { first_name: 'Sarah' },
      updater: null,
    })

    const updated = await updateIncident(created.id, {
      title: 'Found coat',
      updated_by: SEED.staff.admin,
      parent_notified: true,
      parent_notified_at: '2026-09-20T12:00:00.000Z',
    })
    expect(updated).toMatchObject({
      title: 'Found coat',
      parent_notified: true,
      updater: { id: SEED.staff.admin, first_name: 'Alice' },
    })
  })

  it('throws when updating a missing incident', async () => {
    await expect(
      updateIncident('60000000-0000-0000-0000-0000000000ff', {
        updated_by: SEED.staff.admin,
      }),
    ).rejects.toThrow('Incident not found')
  })

  it('rejects an unknown type', async () => {
    const err = await createIncident({
      type: 'fire' as 'other',
      student_id: SEED.students.carol,
      title: 'x',
      description: 'x',
      incident_date: '2026-09-20T10:00:00.000Z',
      created_by: SEED.staff.teacher2,
    }).catch((e: unknown) => e)
    expect(asDbError(err)?.code).toBe('23514')
  })
})
