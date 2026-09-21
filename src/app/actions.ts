'use server'

import { updateTag } from 'next/cache'

import { runAction } from '@/lib/action'

// Returns void, not ActionResult: the refresh button in the layout takes a
// `() => Promise<void>`. Plan 03 deletes this action with the cache.
export async function revalidateAllCaches(): Promise<void> {
  await runAction({
    name: 'cache.revalidate-all',
    formData: new FormData(),
    run: async () => {
      updateTag('students')
      updateTag('classes')
      updateTag('staff')
      updateTag('staff-payroll')
      updateTag('fee-plans')
      updateTag('student-fees')
      updateTag('academic-years')
    },
    fallbackError: 'Failed to refresh cached data. Please try again.',
  })
}
