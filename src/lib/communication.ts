import { personName } from '@/lib/format'
import { guardianEmailsForMailto, normalizeAndDedupeEmails } from '@/lib/mailto'

/** Exchange dynamic distribution lists from scripts/m365-sync (alias @hshb.org.uk). */
export const ALL_PARENTS_LIST = 'allparents@hshb.org.uk'
export const ALL_TEACHERS_LIST = 'allteachers@hshb.org.uk'

export type CommunicationAudience =
  'broadcast' | 'parents' | 'teachers' | 'class'

export type RecipientFields = {
  to: string[]
  cc: string[]
  bcc: string[]
}

export type ClassEmailRoster = {
  id: string
  name: string
  teacherName: string | null
  teacherEmail: string | null
  guardianEmails: string[]
}

type GuardianEmail = { email?: string | null } | null

export type ClassEmailSource = {
  id: string
  name: string
  year_group: string
  teacher: {
    first_name: string
    last_name: string
    display_name?: string | null
    email: string | null
  } | null
  student_classes: Array<{
    student: {
      primary_guardian: GuardianEmail
      secondary_guardian: GuardianEmail
    } | null
  }> | null
}

export function toClassEmailRoster(row: ClassEmailSource): ClassEmailRoster {
  const students = (row.student_classes ?? [])
    .map((stay) => stay.student)
    .filter((student) => student !== null)

  return {
    id: row.id,
    name: row.name,
    teacherName: row.teacher ? personName(row.teacher) : null,
    teacherEmail: row.teacher?.email?.trim() || null,
    guardianEmails: guardianEmailsForMailto(students),
  }
}

export function recipientFields(
  audience: CommunicationAudience,
  selectedClass: ClassEmailRoster | null,
): RecipientFields {
  switch (audience) {
    case 'broadcast':
      return {
        to: [ALL_PARENTS_LIST, ALL_TEACHERS_LIST],
        cc: [],
        bcc: [],
      }
    case 'parents':
      return { to: [ALL_PARENTS_LIST], cc: [], bcc: [] }
    case 'teachers':
      return { to: [ALL_TEACHERS_LIST], cc: [], bcc: [] }
    case 'class':
      return {
        to: [],
        cc: normalizeAndDedupeEmails([selectedClass?.teacherEmail]),
        bcc: normalizeAndDedupeEmails(selectedClass?.guardianEmails ?? []),
      }
  }
}
