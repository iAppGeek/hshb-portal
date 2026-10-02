import 'server-only'

import { and, asc, count, eq, or, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { isUuid } from '@/lib/uuid'
import type { Database } from '@/types/database'

import { toCamel, toSnake } from './casing'
import { db, supabase } from './client'
import { isCurrentStay } from './membership'
import { guardians, students } from './schema'

export type GuardianInsert = {
  first_name: string
  last_name: string
  phone: string
  email?: string | null
  occupation?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  city?: string | null
  postcode?: string | null
  notes?: string | null
}

export type GuardianSummary = {
  id: string
  first_name: string
  last_name: string
  phone: string
}

// Superset of GuardianSummary for the guardians list/search UI. The student
// guardian-picker forms only need GuardianSummary's four fields, and
// GuardianListItem is structurally assignable to it, so getAllGuardians can
// serve both without those forms taking on fields they never use.
export type GuardianListItem = GuardianSummary & {
  email: string | null
}

// GuardianListItem plus the child count only the /guardians list page needs
// — see getGuardiansWithChildCounts.
export type GuardianWithChildCount = GuardianListItem & {
  child_count: number
}

const listColumns = {
  id: guardians.id,
  firstName: guardians.firstName,
  lastName: guardians.lastName,
  phone: guardians.phone,
  email: guardians.email,
}

/** Students linked to `guardianId` (a value or a column) in any of the four contact slots. */
function linkedTo(guardianId: string | AnyPgColumn): SQL {
  return or(
    eq(students.primaryGuardianId, guardianId),
    eq(students.secondaryGuardianId, guardianId),
    eq(students.additionalContact1Id, guardianId),
    eq(students.additionalContact2Id, guardianId),
  ) as SQL
}

export async function getGuardianCount(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(guardians)
  return n
}

// Deliberately does not include the per-guardian child count — that's
// getGuardiansWithChildCounts, which only the /guardians list page needs.
// Ordered by (last_name, id) so duplicate last names keep a stable order.
export async function getAllGuardians(): Promise<GuardianListItem[]> {
  const rows = await db
    .select(listColumns)
    .from(guardians)
    .orderBy(asc(guardians.lastName), asc(guardians.id))
  return toSnake(rows)
}

/**
 * The /guardians list: every guardian with the number of students (active
 * or not) linked to them in any contact slot. A student is counted once per
 * guardian even when the guardian fills two of their slots.
 */
export async function getGuardiansWithChildCounts(): Promise<
  GuardianWithChildCount[]
> {
  const rows = await db
    .select({
      ...listColumns,
      childCount: db.$count(students, linkedTo(guardians.id)),
    })
    .from(guardians)
    .orderBy(asc(guardians.lastName), asc(guardians.id))
  return toSnake(rows)
}

export async function createGuardian(
  data: GuardianInsert,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(guardians)
    .values(toCamel(data))
    .returning({ id: guardians.id })
  return row
}

export type GuardianFull = GuardianInsert & { id: string }

export async function getGuardianById(
  id: string,
): Promise<GuardianFull | null> {
  // A malformed id finds nothing, rather than failing the uuid cast.
  if (!isUuid(id)) return null

  const [row] = await db
    .select({
      id: guardians.id,
      firstName: guardians.firstName,
      lastName: guardians.lastName,
      phone: guardians.phone,
      email: guardians.email,
      occupation: guardians.occupation,
      addressLine1: guardians.addressLine1,
      addressLine2: guardians.addressLine2,
      city: guardians.city,
      postcode: guardians.postcode,
      notes: guardians.notes,
    })
    .from(guardians)
    .where(eq(guardians.id, id))
  return row ? toSnake(row) : null
}

export type GuardianStudentLink = {
  id: string
  first_name: string
  last_name: string
  student_code: string | null
}

export async function getStudentsByGuardian(
  guardianId: string,
): Promise<GuardianStudentLink[]> {
  // A malformed id finds nothing, rather than failing the uuid cast.
  if (!isUuid(guardianId)) return []

  const rows = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      studentCode: students.studentCode,
    })
    .from(students)
    .where(and(linkedTo(guardianId), eq(students.active, true)))
    .orderBy(asc(students.lastName))
  return toSnake(rows)
}

export type FamilySlot =
  'primary' | 'secondary' | 'additional_1' | 'additional_2'

export type FamilyChild = {
  id: string
  first_name: string
  last_name: string
  student_code: string | null
  active: boolean
  leaving_reason: string | null
  relationship: string | null
  slot: FamilySlot
  classes: { id: string; name: string }[]
}

export type FamilyCoGuardianLink = {
  childId: string
  childName: string
  slot: FamilySlot
}

export type FamilyCoGuardian = {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  links: FamilyCoGuardianLink[]
}

export type GuardianFamily = {
  children: FamilyChild[]
  coGuardians: FamilyCoGuardian[]
}

type SlotGuardian = {
  id: string
  firstName: string
  lastName: string
  phone: string
  email: string | null
}

type StudentGuardianSlot = {
  slot: FamilySlot
  guardian: SlotGuardian | null
  relationship: string | null
}

const slotGuardian = {
  columns: {
    id: true,
    firstName: true,
    lastName: true,
    phone: true,
    email: true,
  },
} as const

// Same order the database would give for `order by last_name`.
const byLastName = new Intl.Collator('en-US')

// Anchored on one guardian rather than a derived "family" grouping — see
// plans/guardian-family-view.md decision 1. Returns that guardian's children
// across all four contact slots (including leavers), plus every other
// guardian linked to those same children ("also linked"), one hop out. This
// is what lets a child with a different primary guardian still surface: open
// either parent and both children show, with the other parent listed as a
// co-guardian. One query: the co-guardians come with the children's slots.
export async function getFamilyForGuardian(
  rawGuardianId: string,
): Promise<GuardianFamily> {
  // Postgres always returns UUIDs in canonical lowercase, so normalise the
  // incoming id here — otherwise a differently-cased id (e.g. typed into
  // the URL) would defeat every `===` slot comparison below and every
  // child would fall back to slot: 'primary', rendering the guardian as
  // their own co-guardian.
  const guardianId = rawGuardianId.toLowerCase()

  // Returning the empty family for a malformed id — rather than throwing —
  // lets the guardian page's existing "not found" redirect handle it
  // instead of surfacing a 500.
  if (!isUuid(guardianId)) return { children: [], coGuardians: [] }

  const rows = await db.query.students.findMany({
    columns: {
      id: true,
      firstName: true,
      lastName: true,
      studentCode: true,
      active: true,
      leavingReason: true,
      primaryGuardianRelationship: true,
      secondaryGuardianRelationship: true,
      additionalContact1Relationship: true,
      additionalContact2Relationship: true,
    },
    with: {
      // Current classes only — a child shouldn't show classes they've left.
      studentClasses: {
        where: isCurrentStay,
        columns: {},
        with: { class: { columns: { id: true, name: true } } },
      },
      primaryGuardian: slotGuardian,
      secondaryGuardian: slotGuardian,
      additionalContact1: slotGuardian,
      additionalContact2: slotGuardian,
    },
    where: linkedTo(guardianId),
    orderBy: asc(students.lastName),
  })

  const children: FamilyChild[] = []
  const coGuardiansById: Record<string, FamilyCoGuardian> = {}

  for (const student of rows) {
    const slots: StudentGuardianSlot[] = [
      {
        slot: 'primary',
        guardian: student.primaryGuardian,
        relationship: student.primaryGuardianRelationship,
      },
      {
        slot: 'secondary',
        guardian: student.secondaryGuardian,
        relationship: student.secondaryGuardianRelationship,
      },
      {
        slot: 'additional_1',
        guardian: student.additionalContact1,
        relationship: student.additionalContact1Relationship,
      },
      {
        slot: 'additional_2',
        guardian: student.additionalContact2,
        relationship: student.additionalContact2Relationship,
      },
    ]
    const matched = slots.find((slot) => slot.guardian?.id === guardianId)

    children.push({
      id: student.id,
      first_name: student.firstName,
      last_name: student.lastName,
      student_code: student.studentCode,
      active: student.active,
      leaving_reason: student.leavingReason,
      relationship: matched?.relationship ?? null,
      slot: matched?.slot ?? 'primary',
      classes: student.studentClasses.map((sc) => sc.class),
    })

    // A guardian occupying more than one slot on the same child (e.g.
    // secondary and an additional contact) is recorded once per child,
    // under whichever of their slots is checked first — otherwise they'd
    // get duplicate "also linked" entries for that one child.
    const recordedForStudent = new Set<string>()
    for (const { slot, guardian } of slots) {
      if (
        !guardian ||
        guardian.id === guardianId ||
        recordedForStudent.has(guardian.id)
      ) {
        continue
      }
      recordedForStudent.add(guardian.id)
      coGuardiansById[guardian.id] ??= {
        id: guardian.id,
        first_name: guardian.firstName,
        last_name: guardian.lastName,
        phone: guardian.phone,
        email: guardian.email,
        links: [],
      }
      coGuardiansById[guardian.id].links.push({
        childId: student.id,
        childName: `${student.firstName} ${student.lastName}`,
        slot,
      })
    }
  }

  const coGuardians = Object.values(coGuardiansById).sort((a, b) =>
    byLastName.compare(a.last_name, b.last_name),
  )
  return { children, coGuardians }
}

export async function updateGuardian(
  id: string,
  data: GuardianInsert,
): Promise<void> {
  await db
    .update(guardians)
    .set({ ...toCamel(data), updatedAt: new Date().toISOString() })
    .where(eq(guardians.id, id))
}

export type GuardianMatch = {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  occupation: string | null
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  postcode: string | null
  matched_on: 'email' | 'phone'
}

// Mirrors the de-dup rule approve_registration uses, surfaced so an admin can
// see which contacts on a submission would be linked to an existing guardian.
export async function findGuardianMatches({
  email,
  phone,
  lastName,
}: {
  email: string | null
  phone: string
  lastName: string
}): Promise<GuardianMatch[]> {
  const { data, error } = await supabase.rpc('find_guardian_matches', {
    p_email: email ?? undefined,
    p_phone: phone,
    p_last_name: lastName,
  } as Database['public']['Functions']['find_guardian_matches']['Args'])
  if (error) throw error
  return (data ?? []) as GuardianMatch[]
}
