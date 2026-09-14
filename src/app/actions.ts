'use server'

import { updateTag } from 'next/cache'

import { auth } from '@/auth'

export async function revalidateAllCaches(): Promise<void> {
  const session = await auth()
  if (!session) return
  updateTag('students')
  updateTag('classes')
  updateTag('staff')
  updateTag('staff-payroll')
  updateTag('fee-plans')
  updateTag('student-fees')
  updateTag('academic-years')
}
