import { unstable_cache, updateTag } from 'next/cache'

import type { EnrolmentRangeRow, SummaryClass } from '@/lib/attendanceSummary'
import type { EnrolmentRow } from '@/lib/enrolment'
import type { Database } from '@/types/database'

import { getCurrentAcademicYear } from './academic-years'
import { supabase } from './client'
import { withCurrentClasses } from './membership'
import { fetchAllPages } from './paging'

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
    // Member details let the class form show a leaver still on the class,
    // who isn't in the selectable (active) student list.
    const { data } = await withCurrentClasses(
      supabase
        .from('classes')
        .select(
          `${CLASS_SELECT}, student_classes(student_id, student:students(id, first_name, last_name, student_code, active, leaving_reason))`,
        )
        .eq('id', id),
    ).single()
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
    const query = supabase
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
      ),
      enrolment_history:student_classes(
        start_date, end_date,
        student:students(id, first_name, last_name)
      )`,
      )
      .eq('id', id)
    // Only the roster embed is filtered; enrolment_history keeps every stay.
    const { data } = await withCurrentClasses(query).single()
    return data ? withYearCode(data) : data
  },
  ['class-with-students'],
  { revalidate: 60, tags: ['classes', 'students'] },
)

export const getEnrolmentsForClass = unstable_cache(
  async (classId: string): Promise<EnrolmentRow[]> => {
    const { data, error } = await supabase
      .from('student_classes')
      .select('class_id, student_id, start_date, end_date')
      .eq('class_id', classId)
    if (error) throw error
    return data ?? []
  },
  ['enrolments-for-class'],
  { revalidate: 60, tags: ['classes', 'students'] },
)

export const getEnrolmentsInRange = unstable_cache(
  async (start: string, end: string): Promise<EnrolmentRangeRow[]> => {
    const rows = await fetchAllPages<{
      class_id: string
      student_id: string
      start_date: string
      end_date: string | null
      class: {
        id: string
        name: string
        active: boolean
        academic_year: { code: string } | null
      } | null
    }>((from, to) =>
      supabase
        .from('student_classes')
        .select(
          'class_id, student_id, start_date, end_date, class:classes!inner(id, name, active, academic_year:academic_years(code))',
        )
        .lte('start_date', end)
        .or(`end_date.is.null,end_date.gt.${start}`)
        .order('id')
        .range(from, to),
    )
    return rows
      .filter((r) => r.class)
      .map((r) => ({
        class_id: r.class_id,
        student_id: r.student_id,
        start_date: r.start_date,
        end_date: r.end_date,
        class: {
          id: r.class!.id,
          name: r.class!.name,
          active: r.class!.active,
          yearCode: r.class!.academic_year?.code ?? null,
        } satisfies SummaryClass,
      }))
  },
  ['enrolments-in-range'],
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

/** A class's academic year is fixed once created; deactivation only happens
 * via migration, so `active` is not accepted here either. */
export async function updateClass(
  id: string,
  data: Partial<Omit<ClassInsert, 'academic_year_id' | 'active'>>,
) {
  const { error } = await supabase.from('classes').update(data).eq('id', id)
  if (error) throw error
  updateTag('classes')
  updateTag('students')
}

export type MigrationAction =
  | 'move'
  | 'none'
  | 'left'
  | 'graduated'
  | 'transferred'

type MigrateClassInput = {
  name: string
  year_group: string
  room_number: string | null
  academic_year_id: string
  teacher_id: string
}

export type MigrateClassResult = {
  new_class_id: string | null
  moved: number
  unassigned: number
  leavers: number
}

export async function migrateClass(input: {
  sourceClassId: string
  studentActions: Record<string, MigrationAction>
  newClass: MigrateClassInput | null
}): Promise<MigrateClassResult> {
  // Supabase codegen marks these as optional strings rather than nullable —
  // the SQL function treats all-NULL new-class params as "no new class".
  const { data, error } = await supabase.rpc('migrate_class', {
    p_source_class_id: input.sourceClassId,
    p_student_actions: input.studentActions,
    p_academic_year_id: input.newClass?.academic_year_id,
    p_name: input.newClass?.name,
    p_year_group: input.newClass?.year_group,
    p_room_number: input.newClass?.room_number ?? undefined,
    p_teacher_id: input.newClass?.teacher_id,
  } as Database['public']['Functions']['migrate_class']['Args'])
  if (error) throw error
  updateTag('classes')
  updateTag('students')
  return data as unknown as MigrateClassResult
}

export async function setClassStudents(classId: string, studentIds: string[]) {
  const { error } = await supabase.rpc('set_enrolments', {
    p_student_id: null,
    p_class_id: classId,
    p_ids: studentIds,
  } as unknown as Database['public']['Functions']['set_enrolments']['Args'])
  if (error) throw error
  updateTag('classes')
  updateTag('students')
}
