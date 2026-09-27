import 'server-only'

import { asc, eq, inArray } from 'drizzle-orm'

import { TEACHING_ROLES } from '@/lib/permissions'

import { toCamel, toSnake, type Snake } from './casing'
import { db } from './client'
import { staff, type Class, type Staff } from './schema'

const staffColumns = {
  id: staff.id,
  email: staff.email,
  title: staff.title,
  firstName: staff.firstName,
  lastName: staff.lastName,
  displayName: staff.displayName,
  role: staff.role,
  contactNumber: staff.contactNumber,
  personalEmail: staff.personalEmail,
  createdAt: staff.createdAt,
}

type StaffMember = Snake<
  Pick<
    Staff,
    | 'id'
    | 'email'
    | 'title'
    | 'firstName'
    | 'lastName'
    | 'displayName'
    | 'role'
    | 'contactNumber'
    | 'personalEmail'
    | 'createdAt'
  >
>

type StaffWithClasses = Snake<
  Staff & { classes: Pick<Class, 'id' | 'name' | 'roomNumber' | 'yearGroup'>[] }
>

type Teacher = Snake<
  Pick<Staff, 'id' | 'firstName' | 'lastName' | 'displayName'>
>

type StaffInput = {
  title: string
  first_name: string
  last_name: string
  email: string
  role: string
  display_name?: string | null
  contact_number?: string | null
  personal_email?: string | null
}

export async function getStaffByEmail(
  email: string,
): Promise<StaffMember | null> {
  const [row] = await db
    .select(staffColumns)
    .from(staff)
    .where(eq(staff.email, email.toLowerCase()))
  return row ? toSnake(row) : null
}

export async function getStaffById(id: string): Promise<StaffMember | null> {
  const [row] = await db
    .select(staffColumns)
    .from(staff)
    .where(eq(staff.id, id))
  return row ? toSnake(row) : null
}

export async function getAllStaff(): Promise<StaffMember[]> {
  const rows = await db
    .select(staffColumns)
    .from(staff)
    .orderBy(asc(staff.lastName))
  return toSnake(rows)
}

export async function getAllStaffWithClasses(): Promise<StaffWithClasses[]> {
  const rows = await db.query.staff.findMany({
    with: {
      classes: {
        columns: { id: true, name: true, roomNumber: true, yearGroup: true },
      },
    },
    orderBy: asc(staff.lastName),
  })
  return toSnake(rows)
}

export async function getTeachers(): Promise<Teacher[]> {
  const rows = await db
    .select({
      id: staff.id,
      firstName: staff.firstName,
      lastName: staff.lastName,
      displayName: staff.displayName,
    })
    .from(staff)
    .where(inArray(staff.role, TEACHING_ROLES))
    .orderBy(asc(staff.lastName))
  return toSnake(rows)
}

export async function createStaff(input: StaffInput): Promise<Snake<Staff>> {
  const [row] = await db.insert(staff).values(toCamel(input)).returning()
  return toSnake(row)
}

export async function updateStaff(
  id: string,
  input: StaffInput,
): Promise<void> {
  await db.update(staff).set(toCamel(input)).where(eq(staff.id, id))
}
