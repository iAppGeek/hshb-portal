import Image from 'next/image'
import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth, signOut } from '@/auth'
import logo from '@/images/logo.png'

export const metadata: Metadata = { title: 'No Access' }

export default async function NoAccessPage(): Promise<React.ReactElement> {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role) redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg ring-1 ring-gray-200 sm:p-8">
        <Image
          src={logo}
          alt="HSHB Logo"
          className="mx-auto mb-6 h-12 w-auto"
        />
        <h1 className="text-xl font-bold text-gray-900">No access</h1>
        <p className="mt-2 text-sm text-gray-500">
          You&rsquo;re signed in
          {session.user.email ? ` as ${session.user.email}` : ''}, but your
          account doesn&rsquo;t have a staff role yet. Contact the admin team to
          get access.
        </p>

        <form
          className="mt-6"
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/login' })
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
