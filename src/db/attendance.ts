import type { AttendanceRangeRow, SummaryClass } from '@/lib/attendanceSummary'
import type { Tables, TablesInsert } from '@/types/database'

import { supabase } from './client'
import { fetchAllPages } from './paging'

export type AttendanceStatus = 'present' | 'absent' | 'late'
export type AttendanceInsert = TablesInsert<'attendance'>
export type AttendanceRow = Tables<'attendance'>

export async function getAttendanceByClassAndDate(
  classId: string,
  date: string,
) {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('class_id', classId)
    .eq('date', date)
  if (error) throw error
  return data
}

type AttendanceRangeQueryRow = {
  class_id: string
  student_id: string
  date: string
  status: AttendanceStatus
  created_at: string
  updated_at: string
  class: {
    id: string
    name: string
    active: boolean
    academic_year: { code: string } | null
  } | null
}

/** Fetch attendance rows across a date range for aggregation, paged past
 * PostgREST's 1000-row cap. */
export async function getAttendanceByDateRange(
  startDate: string,
  endDate: string,
): Promise<(AttendanceRangeRow & { class: SummaryClass })[]> {
  const rows = await fetchAllPages<AttendanceRangeQueryRow>(
    (from, to) =>
      supabase
        .from('attendance')
        .select(
          'class_id, student_id, date, status, created_at, updated_at, class:classes!inner(id, name, active, academic_year:academic_years(code))',
        )
        .gte('date', startDate)
        .lte('date', endDate)
        .order('id')
        .range(from, to) as unknown as PromiseLike<{
        data: AttendanceRangeQueryRow[] | null
        error: unknown
      }>,
  )
  return rows
    .filter((r) => r.class)
    .map((r) => ({
      class_id: r.class_id,
      student_id: r.student_id,
      date: r.date,
      status: r.status,
      created_at: r.created_at,
      updated_at: r.updated_at,
      class: {
        id: r.class!.id,
        name: r.class!.name,
        active: r.class!.active,
        yearCode: r.class!.academic_year?.code ?? null,
      } satisfies SummaryClass,
    }))
}

export async function saveAttendance(
  records: AttendanceInsert[],
): Promise<AttendanceRow[]> {
  const { data, error } = await supabase
    .from('attendance')
    .upsert(records, { onConflict: 'class_id,student_id,date' })
    .select()
  if (error) throw error
  return data
}
