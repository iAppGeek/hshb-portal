import { unstable_cache, updateTag } from 'next/cache'

import type { Database } from '@/types/database'

import { supabase } from './client'

type GuardianInsert = {
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
  child_count: number
}

const OPTS = { revalidate: 60, tags: ['students'] }

const GUARDIAN_SLOTS_SELECT =
  'primary_guardian_id, secondary_guardian_id, additional_contact_1_id, additional_contact_2_id'

type GuardianSlotsRow = {
  primary_guardian_id: string
  secondary_guardian_id: string | null
  additional_contact_1_id: string | null
  additional_contact_2_id: string | null
}

/** Every guardian id a student links to, across all four contact slots. */
function guardianIdsOnStudent(student: GuardianSlotsRow): string[] {
  return [
    student.primary_guardian_id,
    student.secondary_guardian_id,
    student.additional_contact_1_id,
    student.additional_contact_2_id,
  ].filter((id): id is string => id !== null)
}

export async function getGuardianCount(): Promise<number> {
  const { count, error } = await supabase
    .from('guardians')
    .select('*', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

export const getAllGuardians = unstable_cache(
  async (): Promise<GuardianListItem[]> => {
    const [{ data: guardians }, { data: students }] = await Promise.all([
      supabase
        .from('guardians')
        .select('id, first_name, last_name, phone, email')
        .order('last_name'),
      supabase.from('students').select(GUARDIAN_SLOTS_SELECT),
    ])

    const counts = new Map<string, number>()
    for (const student of students ?? []) {
      for (const guardianId of guardianIdsOnStudent(student)) {
        counts.set(guardianId, (counts.get(guardianId) ?? 0) + 1)
      }
    }

    return (guardians ?? []).map((guardian) => ({
      ...guardian,
      child_count: counts.get(guardian.id) ?? 0,
    }))
  },
  ['all-guardians'],
  OPTS,
)

export async function createGuardian(data: GuardianInsert) {
  const { data: guardian, error } = await supabase
    .from('guardians')
    .insert(data)
    .select('id')
    .single()
  if (error) throw error
  updateTag('students')
  return guardian
}

export type GuardianFull = GuardianInsert & { id: string }

export async function getGuardianById(
  id: string,
): Promise<GuardianFull | null> {
  const { data } = await supabase
    .from('guardians')
    .select(
      'id, first_name, last_name, phone, email, occupation, address_line_1, address_line_2, city, postcode, notes',
    )
    .eq('id', id)
    .single()
  return data
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
  const { data } = await supabase
    .from('students')
    .select('id, first_name, last_name, student_code')
    .or(
      `primary_guardian_id.eq.${guardianId},secondary_guardian_id.eq.${guardianId},additional_contact_1_id.eq.${guardianId},additional_contact_2_id.eq.${guardianId}`,
    )
    .eq('active', true)
    .order('last_name')
  return data ?? []
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

type FamilyStudentRow = {
  id: string
  first_name: string
  last_name: string
  student_code: string | null
  active: boolean
  leaving_reason: string | null
  primary_guardian_id: string
  primary_guardian_relationship: string | null
  secondary_guardian_id: string | null
  secondary_guardian_relationship: string | null
  additional_contact_1_id: string | null
  additional_contact_1_relationship: string | null
  additional_contact_2_id: string | null
  additional_contact_2_relationship: string | null
  student_classes: { class: { id: string; name: string } | null }[]
}

type StudentGuardianSlot = {
  slot: FamilySlot
  guardianId: string | null
  relationship: string | null
}

function slotsForStudent(student: FamilyStudentRow): StudentGuardianSlot[] {
  return [
    {
      slot: 'primary',
      guardianId: student.primary_guardian_id,
      relationship: student.primary_guardian_relationship,
    },
    {
      slot: 'secondary',
      guardianId: student.secondary_guardian_id,
      relationship: student.secondary_guardian_relationship,
    },
    {
      slot: 'additional_1',
      guardianId: student.additional_contact_1_id,
      relationship: student.additional_contact_1_relationship,
    },
    {
      slot: 'additional_2',
      guardianId: student.additional_contact_2_id,
      relationship: student.additional_contact_2_relationship,
    },
  ]
}

const FAMILY_STUDENT_SELECT = `
  id, first_name, last_name, student_code, active, leaving_reason,
  primary_guardian_id, primary_guardian_relationship,
  secondary_guardian_id, secondary_guardian_relationship,
  additional_contact_1_id, additional_contact_1_relationship,
  additional_contact_2_id, additional_contact_2_relationship,
  student_classes(class:classes(id, name))
`

// Anchored on one guardian rather than a derived "family" grouping — see
// plans/guardian-family-view.md decision 1. Returns that guardian's children
// across all four contact slots (including leavers), plus every other
// guardian linked to those same children ("also linked"), one hop out. This
// is what lets a child with a different primary guardian still surface: open
// either parent and both children show, with the other parent listed as a
// co-guardian.
export const getFamilyForGuardian = unstable_cache(
  async (guardianId: string): Promise<GuardianFamily> => {
    const { data: students } = await supabase
      .from('students')
      .select(FAMILY_STUDENT_SELECT)
      .or(
        `primary_guardian_id.eq.${guardianId},secondary_guardian_id.eq.${guardianId},additional_contact_1_id.eq.${guardianId},additional_contact_2_id.eq.${guardianId}`,
      )
      .order('last_name')

    const rows = (students ?? []) as unknown as FamilyStudentRow[]
    if (rows.length === 0) return { children: [], coGuardians: [] }

    const children: FamilyChild[] = []
    const coGuardianLinks = new Map<string, FamilyCoGuardianLink[]>()

    for (const student of rows) {
      const slots = slotsForStudent(student)
      const matched = slots.find((slot) => slot.guardianId === guardianId)

      children.push({
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        student_code: student.student_code,
        active: student.active,
        leaving_reason: student.leaving_reason,
        relationship: matched?.relationship ?? null,
        slot: matched?.slot ?? 'primary',
        classes: student.student_classes
          .map((sc) => sc.class)
          .filter((c): c is { id: string; name: string } => c !== null),
      })

      for (const slot of slots) {
        if (slot.guardianId && slot.guardianId !== guardianId) {
          const links = coGuardianLinks.get(slot.guardianId) ?? []
          links.push({
            childId: student.id,
            childName: `${student.first_name} ${student.last_name}`,
            slot: slot.slot,
          })
          coGuardianLinks.set(slot.guardianId, links)
        }
      }
    }

    if (coGuardianLinks.size === 0) return { children, coGuardians: [] }

    const { data: coGuardianRows } = await supabase
      .from('guardians')
      .select('id, first_name, last_name, phone, email')
      .in('id', [...coGuardianLinks.keys()])
      .order('last_name')

    const coGuardians: FamilyCoGuardian[] = (coGuardianRows ?? []).map(
      (guardian) => ({
        ...guardian,
        links: coGuardianLinks.get(guardian.id) ?? [],
      }),
    )

    return { children, coGuardians }
  },
  ['guardian-family'],
  OPTS,
)

export async function updateGuardian(id: string, data: GuardianInsert) {
  const { error } = await supabase
    .from('guardians')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  updateTag('students')
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
