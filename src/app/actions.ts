'use server'

import { revalidateTag } from 'next/cache'

import { auth } from '@/auth'

export async function revalidateAllCaches(): Promise<void> {
  const session = await auth()
  if (!session) return
  revalidateTag('students', 'max')
  revalidateTag('classes', 'max')
  revalidateTag('staff', 'max')
}
