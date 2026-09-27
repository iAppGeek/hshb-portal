import 'server-only'

import { desc, eq } from 'drizzle-orm'
import { cache } from 'react'

import { academicYearForDate } from '@/lib/academicYears'

import { toCamel, toSnake, type Snake } from './casing'
import { db, supabase } from './client'
import { academicYears, type AcademicYear } from './schema'

export type AcademicYearRow = Snake<AcademicYear>

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
  const rows = await db
    .select()
    .from(academicYears)
    .orderBy(desc(academicYears.startDate))
  return toSnake(rows)
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
  const [row] = await db
    .insert(academicYears)
    .values(toCamel(input))
    .returning({ id: academicYears.id })
  return row
}

export async function updateAcademicYear(
  id: string,
  input: Omit<AcademicYearInput, 'code'>,
): Promise<void> {
  await db
    .update(academicYears)
    .set(toCamel(input))
    .where(eq(academicYears.id, id))
}

export async function setCurrentAcademicYear(id: string): Promise<void> {
  const { error } = await supabase.rpc('set_current_academic_year', {
    p_id: id,
  })
  if (error) throw error
}
