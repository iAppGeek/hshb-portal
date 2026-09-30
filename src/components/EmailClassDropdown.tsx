import type { ReactElement } from 'react'

import EmailDropdown from '@/clientComponents/EmailDropdown'
import {
  guardianEmailsForMailto,
  mailtoWithBcc,
  type GuardianEmailSource,
} from '@/lib/mailto'

type Props = {
  students: ReadonlyArray<GuardianEmailSource>
  /** Subject line for "Open in default email app". */
  subject: string
}

/** "Email class" dropdown: guardian emails for the class, as Bcc. */
export default function EmailClassDropdown({
  students,
  subject,
}: Props): ReactElement | null {
  if (students.length === 0) return null

  const emails = guardianEmailsForMailto(students)

  return (
    <EmailDropdown
      groups={[{ emails, mailtoHref: mailtoWithBcc(emails, { subject }) }]}
      buttonLabel="Email class"
      triggerClassName="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 shadow-sm transition hover:bg-blue-50"
      emptyReason="No guardian email addresses on file for this class."
    />
  )
}
