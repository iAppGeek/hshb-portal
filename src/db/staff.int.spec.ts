import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { asDbError } from '@/lib/db-error'

import { db } from './client'
import { staff } from './schema'
import {
  createStaff,
  getAllStaff,
  getAllStaffWithClasses,
  getStaffByEmail,
  getStaffById,
  getTeachers,
  updateStaff,
} from './staff'
import { SEED } from './test-db'

const NEW_EMAIL = 'int.staff@test.hshb.local'

afterAll(async () => {
  await db.delete(staff).where(eq(staff.email, NEW_EMAIL))
})

describe('staff reads', () => {
  it('finds a member by email, case-insensitively, in the summary shape', async () => {
    expect(await getStaffByEmail('Teacher@Test.HSHB.local')).toStrictEqual({
      id: SEED.staff.teacher,
      email: 'teacher@test.hshb.local',
      title: 'Ms',
      first_name: 'Tom',
      last_name: 'Teacher',
      display_name: null,
      role: 'teacher',
      contact_number: '07700000002',
      personal_email: null,
      created_at: expect.any(String),
    })
    expect(await getStaffByEmail('nobody@test.hshb.local')).toBeNull()
  })

  it('finds a member by id, or null', async () => {
    expect((await getStaffById(SEED.staff.admin))?.first_name).toBe('Alice')
    expect(
      await getStaffById('00000000-0000-0000-0000-0000000000ff'),
    ).toBeNull()
    expect(await getStaffById('not-a-uuid')).toBeNull()
  })

  it('lists everyone by last name', async () => {
    const all = await getAllStaff()
    expect(all).toHaveLength(5)
    const lastNames = all.map((s) => s.last_name)
    expect(lastNames).toEqual([...lastNames].sort())
  })

  it('lists staff with the classes they teach', async () => {
    const all = await getAllStaffWithClasses()
    const tom = all.find((s) => s.id === SEED.staff.teacher)
    expect(tom?.classes).toEqual([
      {
        id: SEED.classes.alpha,
        name: 'Alpha',
        room_number: 'R1',
        year_group: 'Year 1',
      },
    ])
    expect(all.find((s) => s.id === SEED.staff.admin)?.classes).toEqual([])
  })

  it('lists teaching staff only', async () => {
    const teachers = await getTeachers()
    expect(teachers.map((t) => t.id).sort()).toEqual(
      [SEED.staff.teacher, SEED.staff.teacher2, SEED.staff.headteacher].sort(),
    )
    expect(Object.keys(teachers[0]).sort()).toEqual([
      'display_name',
      'first_name',
      'id',
      'last_name',
    ])
  })
})

describe('staff writes', () => {
  it('creates and updates a member', async () => {
    const created = await createStaff({
      title: 'Mr',
      first_name: 'Int',
      last_name: 'Staff',
      email: NEW_EMAIL,
      role: 'secretary',
    })
    expect(created).toMatchObject({
      email: NEW_EMAIL,
      role: 'secretary',
      display_name: null,
    })

    await updateStaff(created.id, {
      title: 'Dr',
      first_name: 'Int',
      last_name: 'Staffer',
      email: NEW_EMAIL,
      role: 'admin',
      display_name: 'Dr S',
    })
    expect(await getStaffById(created.id)).toMatchObject({
      title: 'Dr',
      last_name: 'Staffer',
      role: 'admin',
      display_name: 'Dr S',
    })
  })

  it('rejects a duplicate email and an unknown role', async () => {
    const duplicate = await createStaff({
      title: 'Mr',
      first_name: 'Dup',
      last_name: 'Licate',
      email: 'admin@test.hshb.local',
      role: 'admin',
    }).catch((e: unknown) => e)
    expect(asDbError(duplicate)?.code).toBe('23505')

    const badRole = await createStaff({
      title: 'Mr',
      first_name: 'Bad',
      last_name: 'Role',
      email: 'bad.role@test.hshb.local',
      role: 'janitor',
    }).catch((e: unknown) => e)
    expect(asDbError(badRole)?.code).toBe('23514')
  })
})
