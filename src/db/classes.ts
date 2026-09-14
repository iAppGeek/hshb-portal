import { unstable_cache, updateTag } from 'next/cache'

import type { Database } from '@/types/database'

import { getCurrentAcademicYear } from './academic-years'
import { supabase } from './client'

const CLASS_SELECT =
  '*, teacher:staff(id, first_name, last_name, display_name, email), academic_year:academic_years(id, code, start_date, end_date)'

const OPTS = { revalidate: 60, tags: ['classes'] }

type AcademicYearEmbed = {
  id: string
  code: string
  start_date: string
  end_date: string
} | null

/** Keeps the flat `academic_year: string` shape display components already use. */
function withYearCode<T extends { academic_year: AcademicYearEmbed }>(
  row: T,
): Omit<T, 'academic_year'> & { academic_year: string | null } {
  const { academic_year, ...rest } = row
  return { ...rest, academic_year: academic_year?.code ?? null }
}

const getAllClassesForYear = unstable_cache(
  async (yearId: string) => {
    const { data } = await supabase
      .from('classes')
      .select(CLASS_SELECT)
      .eq('active', true)
      .eq('academic_year_id', yearId)
      .order('year_group')
    return (data ?? []).map(withYearCode)
  },
  ['all-classes'],
  OPTS,
)

export async function getAllClasses() {
  const current = await getCurrentAcademicYear()
  return getAllClassesForYear(current.id)
}

export const getClassesByAcademicYear = unstable_cache(
  async (yearId: string) => {
    const { data } = await supabase
      .from('classes')
      .select(CLASS_SELECT)
      .eq('academic_year_id', yearId)
      .order('year_group')
    return (data ?? []).map(withYearCode)
  },
  ['classes-by-academic-year'],
  OPTS,
)

export const getClassById = unstable_cache(
  async (id: string) => {
    const { data } = await supabase
      .from('classes')
      .select(`${CLASS_SELECT}, student_classes(student_id)`)
      .eq('id', id)
      .single()
    return data ? withYearCode(data) : data
  },
  ['class-by-id'],
  OPTS,
)

const getClassesByTeacherForYear = unstable_cache(
  async (teacherId: string, yearId: string) => {
    const { data } = await supabase
      .from('classes')
      .select(CLASS_SELECT)
      .eq('teacher_id', teacherId)
      .eq('active', true)
      .eq('academic_year_id', yearId)
      .order('year_group')
    return (data ?? []).map(withYearCode)
  },
  ['classes-by-teacher'],
  OPTS,
)

export async function getClassesByTeacher(teacherId: string) {
  const current = await getCurrentAcademicYear()
  return getClassesByTeacherForYear(teacherId, current.id)
}

export const getClassWithStudents = unstable_cache(
  async (id: string) => {
    const { data } = await supabase
      .from('classes')
      .select(
        `*, teacher:staff(first_name, last_name, display_name, email),
      academic_year:academic_years(id, code, start_date, end_date),
      student_classes(
        student:students(
          id, student_code, first_name, last_name, allergies,
          primary_guardian:guardians!students_primary_guardian_id_fkey(first_name, last_name, phone, email),
          secondary_guardian:guardians!students_secondary_guardian_id_fkey(first_name, last_name, phone, email)
        )
      )`,
      )
      .eq('id', id)
      .single()
    return data ? withYearCode(data) : data
  },
  ['class-with-students'],
  { revalidate: 60, tags: ['classes', 'students'] },
)

export const getEnrollmentCountsByClass = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const { data } = await supabase
      .from('student_classes')
      .select('class_id, students!inner(active)')
      .eq('students.active', true)
    if (!data) return {}
    const result: Record<string, number> = {}
    for (const row of data) {
      result[row.class_id] = (result[row.class_id] ?? 0) + 1
    }
    return result
  },
  ['enrollment-counts-by-class'],
  { revalidate: 60, tags: ['classes', 'students'] },
)

type ClassInsert = {
  name: string
  year_group: string
  room_number?: string | null
  academic_year_id: string
  teacher_id: string
  active?: boolean
}

export async function createClass(data: ClassInsert) {
  const { data: cls, error } = await supabase
    .from('classes')
    .insert(data)
    .select()
    .single()
  if (error) throw error
  updateTag('classes')
  return cls
}

export async function updateClass(
  id: string,
  data: Partial<ClassInsert> & { active?: boolean },
) {
  const { error } = await supabase.from('classes').update(data).eq('id', id)
  if (error) throw error
  updateTag('classes')
  updateTag('students')
}

type MigrateClassInput = {
  name: string
  year_group: string
  room_number: string | null
  academic_year_id: string
  teacher_id: string
}

export async function migrateClass(
  sourceClassId: string,
  newClass: MigrateClassInput,
): Promise<{ new_class_id: string }> {
  // Supabase codegen types p_room_number as `string` but the Postgres function
  // accepts TEXT (nullable). Cast the args to allow `string | null` here.
  const { data, error } = await supabase.rpc('migrate_class', {
    p_source_class_id: sourceClassId,
    p_name: newClass.name,
    p_year_group: newClass.year_group,
    p_room_number: newClass.room_number,
    p_academic_year_id: newClass.academic_year_id,
    p_teacher_id: newClass.teacher_id,
  } as Database['public']['Functions']['migrate_class']['Args'])
  if (error) throw error
  updateTag('classes')
  updateTag('students')
  return data as { new_class_id: string }
}

export async function setClassStudents(classId: string, studentIds: string[]) {
  const { error: deleteError } = await supabase
    .from('student_classes')
    .delete()
    .eq('class_id', classId)
  if (deleteError) throw deleteError

  if (studentIds.length > 0) {
    const { error: insertError } = await supabase
      .from('student_classes')
      .insert(
        studentIds.map((studentId) => ({
          class_id: classId,
          student_id: studentId,
        })),
      )
    if (insertError) throw insertError
  }
  updateTag('classes')
  updateTag('students')
}
