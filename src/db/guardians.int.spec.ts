import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from './client'
import {
  createGuardian,
  findGuardianMatches,
  getAllGuardians,
  getFamilyForGuardian,
  getGuardianById,
  getGuardianCount,
  getGuardiansWithChildCounts,
  getStudentsByGuardian,
  updateGuardian,
} from './guardians'
import { students } from './schema'
import { resetDatabase, SEED } from './test-db'

const DAN = '30000000-0000-0000-0000-0000000000d1'

beforeAll(async () => {
  // A leaver with Gary in two slots (secondary and additional contact 2).
  await db.insert(students).values({
    id: DAN,
    firstName: 'Dan',
    lastName: 'Leaver',
    active: false,
    leavingReason: 'left',
    primaryGuardianId: SEED.guardians.greg,
    secondaryGuardianId: SEED.guardians.gary,
    secondaryGuardianRelationship: 'Uncle',
    additionalContact2Id: SEED.guardians.gary,
    addressGuardianId: SEED.guardians.greg,
  })
})
afterAll(resetDatabase)

describe('guardian lists', () => {
  it('counts and lists guardians by last name', async () => {
    expect(await getGuardianCount()).toBe(3)
    expect((await getAllGuardians()).map((g) => g.first_name)).toEqual([
      'Gary',
      'Grace',
      'Greg',
    ])
  })

  it('counts each linked student once per guardian, leavers included', async () => {
    const list = await getGuardiansWithChildCounts()
    expect(
      Object.fromEntries(list.map((g) => [g.first_name, g.child_count])),
    ).toEqual({ Gary: 3, Grace: 1, Greg: 2 })
    expect(list[0]).toStrictEqual({
      id: SEED.guardians.gary,
      first_name: 'Gary',
      last_name: 'AliceGuardian',
      phone: '07711000001',
      email: 'gary.alice@example.com',
      child_count: 3,
    })
  })
})

describe('single guardian', () => {
  it('returns the guardian’s details, or null', async () => {
    expect(await getGuardianById(SEED.guardians.grace)).toMatchObject({
      first_name: 'Grace',
      occupation: 'Pharmacist',
      address_line_1: null,
    })
    expect(
      await getGuardianById('20000000-0000-0000-0000-0000000000ff'),
    ).toBeNull()
  })

  it('lists the active students linked in any slot', async () => {
    expect(
      (await getStudentsByGuardian(SEED.guardians.gary))
        .map((s) => s.first_name)
        .sort(),
    ).toEqual(['Alice', 'Bob'])
    expect(await getStudentsByGuardian('not-a-uuid')).toEqual([])
  })

  it('builds the family: children in every slot plus co-guardians', async () => {
    const family = await getFamilyForGuardian(SEED.guardians.gary.toUpperCase())
    expect(
      family.children.map((c) => [c.first_name, c.slot, c.relationship]),
    ).toEqual(
      expect.arrayContaining([
        ['Alice', 'primary', null],
        ['Bob', 'secondary', 'Father'],
        ['Dan', 'secondary', 'Uncle'],
      ]),
    )
    expect(family.children.find((c) => c.first_name === 'Dan')).toMatchObject({
      active: false,
      leaving_reason: 'left',
      classes: [],
    })
    expect(
      family.coGuardians.map((g) => [g.first_name, g.links.length]),
    ).toEqual([
      ['Grace', 1],
      ['Greg', 1],
    ])
    expect(await getFamilyForGuardian('nope')).toEqual({
      children: [],
      coGuardians: [],
    })
  })
})

describe('writes', () => {
  it('creates and updates a guardian', async () => {
    const { id } = await createGuardian({
      first_name: 'Nia',
      last_name: 'New',
      phone: '07000000009',
      address_line_1: '5 New St',
    })
    await updateGuardian(id, {
      first_name: 'Nia',
      last_name: 'Newer',
      phone: '07000000009',
      email: 'nia@example.com',
    })
    // Fields left out of the update keep their value.
    expect(await getGuardianById(id)).toMatchObject({
      last_name: 'Newer',
      email: 'nia@example.com',
      address_line_1: '5 New St',
    })
  })

  it('finds matches through the RPC', async () => {
    const matches = await findGuardianMatches({
      email: 'GRACE.BOB@example.com',
      phone: '00000',
      lastName: 'x',
    })
    expect(matches).toEqual([
      expect.objectContaining({
        id: SEED.guardians.grace,
        matched_on: 'email',
      }),
    ])
  })
})
