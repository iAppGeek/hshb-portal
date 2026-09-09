import { unstable_cache, revalidateTag } from 'next/cache'

import type { Database, Enums, Tables } from '@/types/database'

import { supabase } from './client'

export type PhotoOptOutStatus = Enums<'photo_opt_out_status'>
export type PhotoOptOutRow = Tables<'photo_consent_opt_outs'>

const OPTS = { revalidate: 60, tags: ['photo-opt-outs'] }

export async function createPhotoOptOut(
  input: Database['public']['Tables']['photo_consent_opt_outs']['Insert'],
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('photo_consent_opt_outs')
    .insert(input)
    .select('id')
    .single()
  if (error) throw error
  revalidateTag('photo-opt-outs', 'max')
  return { id: data.id }
}

export const getPhotoOptOuts = unstable_cache(
  async (status: PhotoOptOutStatus | 'all'): Promise<PhotoOptOutRow[]> => {
    let query = supabase
      .from('photo_consent_opt_outs')
      .select('*')
      .order('submitted_at', { ascending: false })
    if (status !== 'all') {
      query = query.eq('status', status)
    }
    const { data } = await query
    return data ?? []
  },
  ['photo-opt-outs'],
  OPTS,
)

export const getPendingPhotoOptOutCount = unstable_cache(
  async (): Promise<number> => {
    const { count } = await supabase
      .from('photo_consent_opt_outs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    return count ?? 0
  },
  ['pending-photo-opt-out-count'],
  OPTS,
)

export const getPhotoOptOutById = unstable_cache(
  async (id: string): Promise<PhotoOptOutRow | null> => {
    const { data } = await supabase
      .from('photo_consent_opt_outs')
      .select('*')
      .eq('id', id)
      .single()
    return data
  },
  ['photo-opt-out-by-id'],
  OPTS,
)

type ApplyPhotoOptOutInput = {
  requestId: string
  staffId: string
  studentId: string
}

export async function applyPhotoOptOut({
  requestId,
  staffId,
  studentId,
}: ApplyPhotoOptOutInput): Promise<string> {
  const { data, error } = await supabase.rpc('apply_photo_opt_out', {
    p_request_id: requestId,
    p_staff_id: staffId,
    p_student_id: studentId,
  })
  if (error) throw error
  revalidateTag('photo-opt-outs', 'max')
  revalidateTag('students', 'max')
  return data as string
}

type RejectPhotoOptOutInput = {
  requestId: string
  staffId: string
  reason: string
}

export async function rejectPhotoOptOut({
  requestId,
  staffId,
  reason,
}: RejectPhotoOptOutInput): Promise<void> {
  const { data, error } = await supabase
    .from('photo_consent_opt_outs')
    .update({
      status: 'rejected',
      rejected_reason: reason,
      actioned_by: staffId,
      actioned_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Request not found or already actioned')
  revalidateTag('photo-opt-outs', 'max')
}

export async function deletePhotoOptOut(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('photo_consent_opt_outs')
    .delete()
    .eq('id', id)
    .neq('status', 'actioned')
    .select('id')
  if (error) throw error
  if (!data?.length)
    throw new Error('Request not found or cannot be deleted once actioned')
  revalidateTag('photo-opt-outs', 'max')
}
