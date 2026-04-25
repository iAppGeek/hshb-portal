import { Suspense } from 'react'
import Image from 'next/image'
import { type Metadata, type Viewport } from 'next'
import { Inter } from 'next/font/google'
import { GoogleAnalytics } from '@next/third-parties/google'
import clsx from 'clsx'
import {
  HomeIcon,
  UsersIcon,
  UserGroupIcon,
  AcademicCapIcon,
  ClipboardDocumentCheckIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  DocumentTextIcon,
  ArrowPathRoundedSquareIcon,
} from '@heroicons/react/24/outline'

import { auth, signOut } from '@/auth'
import logo from '@/images/logo.png'
import {
  canAccessAdminTasks,
  canAccessReports,
  receivesNotifications,
} from '@/lib/permissions'
import { roleLabels } from '@/lib/roleLabels'
import type { StaffRole } from '@/types/next-auth'

import '../styles/tailwind.css'
import { revalidateAllCaches } from './actions'
import IosSplashLinks from './_components/IosSplashLinks'
import NotificationBanner from './_components/NotificationBanner'
import NotificationToggle from './_components/NotificationToggle'
import PortalSidebar from './_components/PortalSidebar'
import PwaRegistrar from './_components/PwaRegistrar'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const siteUrl = process.env.AUTH_URL ?? 'https://portal.hshb.org.uk'
const siteTitle = 'Hellenic School of High Barnet'
const siteDescription =
  'HSHB staff portal — class management, attendance, and reporting.'

export const viewport: Viewport = {
  themeColor: '#1e40af',
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: { template: '%s | Staff Portal', default: 'Staff Portal' },
  description: siteDescription,
  metadataBase: new URL(siteUrl),
  applicationName: 'HSHB Staff Portal',
  authors: { name: 'HSHB', url: 'https://www.hshb.org.uk' },
  category: 'Education',
  robots: { index: false, follow: false },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'HSHB Portal',
    statusBarStyle: 'default',
  },
  icons: { apple: '/icons/portal-icon-192.png' },
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
  openGraph: {
    type: 'website',
    siteName: siteTitle,
    title: 'Staff Portal',
    description: siteDescription,
  },
  formatDetection: { telephone: true, email: true, address: true },
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', Icon: HomeIcon },
  {
    href: '/reports',
    label: 'Reports',
    Icon: ChartBarIcon,
    filter: canAccessReports,
  },
  { href: '/staff', label: 'Staff', Icon: UserGroupIcon },
  { href: '/students', label: 'Students', Icon: UsersIcon },
  { href: '/classes', label: 'Classes', Icon: AcademicCapIcon },
  {
    href: '/attendance',
    label: 'Attendance',
    Icon: ClipboardDocumentCheckIcon,
  },
  {
    href: '/lesson-plans',
    label: 'Lesson Plans',
    Icon: DocumentTextIcon,
  },
  {
    href: '/staff-attendance',
    label: 'Staff Sign-In',
    Icon: ClockIcon,
  },
  {
    href: '/incidents',
    label: 'Incidents',
    Icon: ExclamationTriangleIcon,
  },
  {
    href: '/admin',
    label: 'Admin Tasks',
    Icon: ArrowPathRoundedSquareIcon,
    filter: canAccessAdminTasks,
  },
]

async function AuthedSidebar() {
  const session = await auth()
  const role = session?.user?.role
  const visibleNav = navItems
    .filter((item) => !item.filter || item.filter(role as StaffRole))
    .map(({ href, label }) => ({ href, label }))

  const signOutAction = async () => {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <PortalSidebar
      navItems={visibleNav}
      userName={session?.user?.name}
      userEmail={session?.user?.email}
      roleLabel={role ? roleLabels[role] : null}
      signOutAction={signOutAction}
      refreshAction={revalidateAllCaches}
      notificationSlot={
        receivesNotifications(role as StaffRole) ? <NotificationToggle /> : null
      }
    />
  )
}

async function AuthedNotificationBanner() {
  const session = await auth()
  const role = session?.user?.role as StaffRole | undefined
  return role && receivesNotifications(role) ? <NotificationBanner /> : null
}

function SidebarLoadingSkeleton() {
  const allNavItems = navItems.map(({ href, label, Icon }) => (
    <div
      key={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-300"
    >
      <Icon className="h-5 w-5 shrink-0" />
      {label}
    </div>
  ))

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 bg-gray-900 px-4 md:hidden print:hidden">
        <div className="h-6 w-6 rounded bg-gray-700" />
        <Image src={logo} alt="HSHB Logo" className="h-7 w-auto" />
        <span className="text-sm font-semibold text-white">Staff Portal</span>
      </div>

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-gray-900 md:flex print:hidden">
        <div className="flex items-center gap-3 border-b border-gray-700 px-5 py-4">
          <Image src={logo} alt="HSHB Logo" className="h-8 w-auto" />
          <div>
            <p className="text-sm font-semibold text-white">HSHB</p>
            <p className="text-xs text-gray-400">Staff Portal</p>
          </div>
        </div>
        <nav className="sidebar-nav flex-1 space-y-1 overflow-y-scroll px-3 py-4">
          {allNavItems}
        </nav>
        <div className="border-t border-gray-700 px-4 py-4">
          <p className="animate-pulse text-sm font-medium text-gray-400">
            Loading...
          </p>
        </div>
      </aside>
    </>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={clsx('h-full scroll-smooth antialiased', inter.variable)}
    >
      <head>
        <IosSplashLinks />
      </head>
      <body
        className={clsx('flex min-h-full flex-col', 'bg-white text-slate-900')}
      >
        <div className="flex min-h-screen bg-gray-100 print:min-h-0">
          <PwaRegistrar />
          <Suspense fallback={<SidebarLoadingSkeleton />}>
            <AuthedSidebar />
          </Suspense>
          <main className="flex-1 overflow-auto px-4 py-6 pt-20 md:p-8">
            <Suspense fallback={null}>
              <AuthedNotificationBanner />
            </Suspense>
            {children}
          </main>
        </div>
        {process.env.NODE_ENV === 'production' && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID!} />
        )}
      </body>
    </html>
  )
}
