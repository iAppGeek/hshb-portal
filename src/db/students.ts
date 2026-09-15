import { unstable_cache, updateTag } from 'next/cache'

import type { LeavingReason } from '@/lib/schemas'
import type { Database } from '@/types/database'

import { supabase } from './client'

const STUDENT_LIST_SELECT = 'id, first_name, last_name, student_code'

// The student_classes embed is filtered to open rows only (current classes)
// with `.is('student_classes.end_date', null)` at every call site below —
// never `!inner`, which would drop students with no class.
const STUDENT_SELECT = `
  *,
  student_classes(class:classes(id, name, year_group, academic_year:academic_years(code))),
  primary_guardian:guardians!students_primary_guardian_id_fkey(
    first_name, last_name, phone, email, occupation,
    address_line_1, address_line_2, city, postcode, notes
  ),
  secondary_guardian:guardians!students_secondary_guardian_id_fkey(
    first_name, last_name, phone, email, occupation,
    address_line_1, address_line_2, city, postcode, notes
  ),
  additional_contact_1:guardians!students_additional_contact_1_id_fkey(
    first_name, last_name, phone
  ),
  additional_contact_2:guardians!students_additional_contact_2_id_fkey(
    first_name, last_name, phone
  ),
  address_guardian:guardians!students_address_guardian_id_fkey(
    address_line_1, address_line_2, city, postcode
  )
`

const STUDENT_SELECT_WITH_TEACHER = `
  *,
  student_classes(class:classes(id, name, year_group, teacher_id)),
  enrolment_end_dates:student_classes(end_date),
  primary_guardian:guardians!students_primary_guardian_id_fkey(
    first_name, last_name, phone, email, occupation,
    address_line_1, address_line_2, city, postcode, notes
  ),
  secondary_guardian:guardians!students_secondary_guardian_id_fkey(
    first_name, last_name, phone, email, occupation,
    address_line_1, address_line_2, city, postcode, notes
  ),
  additional_contact_1:guardians!students_additional_contact_1_id_fkey(
    first_name, last_name, phone
  ),
  additional_contact_2:guardians!students_additional_contact_2_id_fkey(
    first_name, last_name, phone
  ),
  address_guardian:guardians!students_address_guardian_id_fkey(
    address_line_1, address_line_2, city, postcode
  )
`

const OPTS = { revalidate: 60, tags: ['students'] }

type StudentClassLink = {
  class: {
    id: string
    name: string
    year_group: string
    academic_year: { code: string } | null
  } | null
}

/** Keeps the flat `class.academic_year: string` shape display components already use. */
function withClassYearCodes<T extends { student_classes: StudentClassLink[] }>(
  row: T,
): Omit<T, 'student_classes'> & {
  student_classes: (Omit<StudentClassLink, 'class'> & {
    class:
      | (Omit<NonNullable<StudentClassLink['class']>, 'academic_year'> & {
          academic_year: string | null
        })
      | null
  })[]
} {
  return {
    ...row,
    student_classes: row.student_classes.map((sc) => ({
      ...sc,
      class: sc.class
        ? { ...sc.class, academic_year: sc.class.academic_year?.code ?? null }
        : null,
    })),
  }
}

export const getStudentsForList = unstable_cache(
  async () => {
    const { data } = await supabase
      .from('students')
      .select(STUDENT_LIST_SELECT)
      .eq('active', true)
      .order('last_name')
    return data ?? []
  },
  ['students-for-list'],
  OPTS,
)

// Not cached — dynamic search input
export async function searchStudents(query: string) {
  const trimmed = query.trim()
  if (!trimmed) return []
  const { data } = await supabase
    .from('students')
    .select(STUDENT_LIST_SELECT)
    .eq('active', true)
    .or(`first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%`)
    .order('last_name')
    .limit(20)
  return data ?? []
}

export const getStudentsByTeacher = unstable_cache(
  async (teacherId: string) => {
    const { data: classes } = await supabase
      .from('classes')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('active', true)

    if (!classes?.length) return []

    const classIds = classes.map((c) => c.id)

    const { data: enrollments } = await supabase
      .from('student_classes')
      .select('student_id')
      .in('class_id', classIds)
      .is('end_date', null)

    if (!enrollments?.length) return []

    const studentIds = [...new Set(enrollments.map((e) => e.student_id))]

    const { data } = await supabase
      .from('students')
      .select(STUDENT_SELECT)
      .in('id', studentIds)
      .eq('active', true)
      .is('student_classes.end_date', null)
      .order('last_name')
    return (data ?? []).map(withClassYearCodes)
  },
  ['students-by-teacher'],
  { revalidate: 60, tags: ['students', 'classes'] },
)

export const getStudentIdsByTeacher = unstable_cache(
  async (teacherId: string): Promise<string[]> => {
    const { data: classes } = await supabase
      .from('classes')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('active', true)

    if (!classes?.length) return []

    const classIds = classes.map((c) => c.id)

    const { data: enrollments } = await supabase
      .from('student_classes')
      .select('student_id')
      .in('class_id', classIds)
      .is('end_date', null)

    return [...new Set(enrollments?.map((e) => e.student_id) ?? [])]
  },
  ['student-ids-by-teacher'],
  { revalidate: 60, tags: ['students', 'classes'] },
)

export const getStudentCount = unstable_cache(
  async (): Promise<number> => {
    const { count } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('active', true)
    return count ?? 0
  },
  ['student-count'],
  OPTS,
)

export const getStudentsWithAllergiesCount = unstable_cache(
  async (): Promise<number> => {
    const { count } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('active', true)
      .not('allergies', 'is', null)
      .neq('allergies', '')
    return count ?? 0
  },
  ['students-allergies-count'],
  OPTS,
)

export const getAllStudents = unstable_cache(
  async (includeInactive: boolean) => {
    let query = supabase
      .from('students')
      .select(STUDENT_SELECT)
      .is('student_classes.end_date', null)
    if (!includeInactive) query = query.eq('active', true)
    const { data } = await query.order('last_name')
    return (data ?? []).map(withClassYearCodes)
  },
  ['all-students'],
  OPTS,
)

export const getStudentsByClass = unstable_cache(
  async (classId: string) => {
    const { data: enrollments } = await supabase
      .from('student_classes')
      .select('student_id')
      .eq('class_id', classId)
      .is('end_date', null)

    if (!enrollments?.length) return []

    const studentIds = enrollments.map((e) => e.student_id)

    const { data } = await supabase
      .from('students')
      .select(STUDENT_SELECT)
      .in('id', studentIds)
      .eq('active', true)
      .is('student_classes.end_date', null)
      .order('last_name')
    return (data ?? []).map(withClassYearCodes)
  },
  ['students-by-class'],
  { revalidate: 60, tags: ['students', 'classes'] },
)

export const getStudentById = unstable_cache(
  async (id: string) => {
    const { data } = await supabase
      .from('students')
      .select(STUDENT_SELECT_WITH_TEACHER)
      .eq('id', id)
      .is('student_classes.end_date', null)
      .single()
    return data
  },
  ['student-by-id'],
  OPTS,
)

/** Returns [] for empty input rather than issuing an unfiltered `.in()`. */
export const getStudentsByIds = unstable_cache(
  async (ids: string[]) => {
    if (ids.length === 0) return []
    const { data } = await supabase
      .from('students')
      .select(STUDENT_SELECT)
      .in('id', ids)
      .is('student_classes.end_date', null)
      .order('last_name')
    return (data ?? []).map(withClassYearCodes)
  },
  ['students-by-ids'],
  { revalidate: 60, tags: ['students', 'classes'] },
)

export type StudentMatch = {
  id: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  student_code: string | null
  active: boolean
}

const STUDENT_MATCH_SELECT =
  'id, first_name, last_name, date_of_birth, student_code, active'

// Includes inactive students so returning children can be found and reactivated.
// Uses a parameterised RPC rather than a string-built PostgREST filter, since
// firstName and lastName originate from the public registration form.
export async function findStudentMatches({
  firstName,
  lastName,
  dateOfBirth,
}: {
  firstName: string
  lastName: string
  dateOfBirth: string
}): Promise<StudentMatch[]> {
  const { data, error } = await supabase.rpc('find_student_matches', {
    p_first_name: firstName,
    p_last_name: lastName,
    p_date_of_birth: dateOfBirth,
  })
  if (error) throw error
  return (data ?? []) as StudentMatch[]
}

export async function getStudentsForLinking(): Promise<StudentMatch[]> {
  const { data } = await supabase
    .from('students')
    .select(STUDENT_MATCH_SELECT)
    .order('last_name')
  return data ?? []
}

type StudentInsert = {
  first_name: string
  last_name: string
  student_code?: string | null
  date_of_birth?: string | null
  english_school_name?: string | null
  address_guardian_id?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  city?: string | null
  postcode?: string | null
  primary_guardian_id: string
  primary_guardian_relationship?: string | null
  secondary_guardian_id?: string | null
  secondary_guardian_relationship?: string | null
  additional_contact_1_id?: string | null
  additional_contact_1_relationship?: string | null
  additional_contact_2_id?: string | null
  additional_contact_2_relationship?: string | null
  allergies?: string | null
  medical_details?: string | null
  notes?: string | null
  consent_privacy_notice?: boolean
  consent_emergency_first_aid?: boolean
  consent_photo_media?: boolean
  consent_home_school?: boolean
  consent_comms_email_sms?: boolean
}

export async function createStudent(data: StudentInsert) {
  const { data: student, error } = await supabase
    .from('students')
    .insert(data)
    .select('id')
    .single()
  if (error) throw error
  updateTag('students')
  return student
}

type StudentUpdate = Partial<StudentInsert>

export async function updateStudent(id: string, data: StudentUpdate) {
  const { error } = await supabase.from('students').update(data).eq('id', id)
  if (error) throw error
  updateTag('students')
}

export async function updateStudentClasses(
  studentId: string,
  classIds: string[],
) {
  // Supabase codegen marks p_class_id as a required string — the SQL function
  // treats a NULL p_class_id as "student mode" (p_ids are class ids).
  const { error } = await supabase.rpc('set_enrolments', {
    p_student_id: studentId,
    p_class_id: null,
    p_ids: classIds,
  } as unknown as Database['public']['Functions']['set_enrolments']['Args'])
  if (error) throw error
  updateTag('students')
  updateTag('classes')
  updateTag('student-fees')
}

export async function markStudentAsLeaver(
  studentId: string,
  reason: LeavingReason,
): Promise<void> {
  const { error } = await supabase.rpc('mark_student_as_leaver', {
    p_student_id: studentId,
    p_reason: reason,
  })
  if (error) throw error
  updateTag('students')
  updateTag('classes')
  updateTag('student-fees')
}
