import { type Metadata } from 'next'

import { auth } from '@/auth'
import SimpleGrid from '@/components/grid/SimpleGrid'
import {
  getAllTimetableSlots,
  getTimetableByClass,
  getClassesByTeacher,
  getAllClasses,
} from '@/db'
import type { GridColumn } from '@/lib/grid/columns'
import { isTeacher, canEditTimetables } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import EmptyState from '../_components/EmptyState'
import PageHeader from '../_components/PageHeader'
import SectionCard from '../_components/SectionCard'

export const metadata: Metadata = { title: 'Timetables' }

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

type TimetableSlot = {
  id: string
  class_id: string
  start_time: string
  end_time: string
  subject: string | null
  room: string | null
}

export default async function TimetablesPage() {
  const session = await auth()
  const role = session?.user?.role as StaffRole
  const staffId = session?.user?.staffId
  const teacherOnly = isTeacher(role)

  const [classes, slots] = await Promise.all([
    teacherOnly ? getClassesByTeacher(staffId!) : getAllClasses(),
    teacherOnly
      ? (async () => {
          const myClasses = await getClassesByTeacher(staffId!)
          const perClass = await Promise.all(
            myClasses.map((c) => getTimetableByClass(c.id)),
          )
          return perClass.flat()
        })()
      : getAllTimetableSlots(),
  ])

  const slotsByDay = DAYS.map((day) => ({
    day,
    slots: slots.filter((s) => s.day_of_week === day),
  })).filter((d) => d.slots.length > 0)

  const columns: GridColumn<TimetableSlot>[] = [
    {
      id: 'time',
      header: 'Time',
      cell: (slot) =>
        `${slot.start_time.slice(0, 5)} – ${slot.end_time.slice(0, 5)}`,
    },
    {
      id: 'class',
      header: 'Class',
      cell: (slot) => classes.find((c) => c.id === slot.class_id)?.name ?? '—',
    },
    {
      id: 'subject',
      header: 'Subject',
      cell: (slot) => slot.subject ?? '—',
    },
    {
      id: 'room',
      header: 'Room',
      cell: (slot) =>
        slot.room ??
        classes.find((c) => c.id === slot.class_id)?.room_number ??
        '—',
    },
  ]

  return (
    <>
      <PageHeader
        title="Timetables"
        action={
          canEditTimetables(role) && (
            <button
              disabled
              title="Timetable slot creation coming soon"
              className="cursor-not-allowed rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-50 shadow-sm"
            >
              Add slot
            </button>
          )
        }
      />

      {slotsByDay.length === 0 ? (
        <EmptyState message="No timetable slots found." />
      ) : (
        <div className="space-y-6">
          {slotsByDay.map(({ day, slots: daySlots }) => (
            <SectionCard key={day} title={day}>
              <SimpleGrid
                columns={columns}
                rows={daySlots}
                getRowKey={(slot) => slot.id}
                frame="none"
              />
            </SectionCard>
          ))}
        </div>
      )}
    </>
  )
}
