import { cache } from 'react'

import { academicYearForDate } from '@/lib/academicYears'
import type { Database } from '@/types/database'

import { supabase } from './client'

export type AcademicYearRow =
  Database['public']['Tables']['academic_years']['Row']

export type AcademicYearInput = {
  code: string
  start_date: string
  end_date: string
}

/**
 * Deduplicated within one request (React `cache`), not across requests: the
 * other lookups below all go through it, and a page often calls several.
 */
export const getAcademicYears = cache(async (): Promise<AcademicYearRow[]> => {
  const { data } = await supabase
    .from('academic_years')
    .select('*')
    .order('start_date', { ascending: false })
  return data ?? []
})

export async function getCurrentAcademicYear(): Promise<AcademicYearRow> {
  const years = await getAcademicYears()
  const current = years.find((y) => y.is_current)
  if (!current) throw new Error('No current academic year is set')
  return current
}

export async function getAcademicYearById(
  id: string,
): Promise<AcademicYearRow | null> {
  const years = await getAcademicYears()
  return years.find((y) => y.id === id) ?? null
}

export async function getAcademicYearForDate(
  date: string,
): Promise<AcademicYearRow | null> {
  const years = await getAcademicYears()
  return academicYearForDate(years, date)
}

export async function createAcademicYear(
  input: AcademicYearInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('academic_years')
    .insert(input)
    .select('id')
    .single()
  if (error) throw error
  return data
}

export async function updateAcademicYear(
  id: string,
  input: Omit<AcademicYearInput, 'code'>,
): Promise<void> {
  const { error } = await supabase
    .from('academic_years')
    .update(input)
    .eq('id', id)
  if (error) throw error
}

export async function setCurrentAcademicYear(id: string): Promise<void> {
  const { error } = await supabase.rpc('set_current_academic_year', {
    p_id: id,
  })
  if (error) throw error
}
