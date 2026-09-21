import Link from 'next/link'

import type { DefinitionItem } from '@/components/DefinitionList'
import { formatDateTimeInSchoolTz } from '@/lib/datetime'

type Reviewed = {
  submitted_at: string
  status: string
  actioned_at: string | null
  student_id: string | null
  rejected_reason: string | null
}

/** The "Workflow" card shared by the registration and opt-out review pages. */
export function workflowItems(record: Reviewed): DefinitionItem[] {
  return [
    {
      label: 'Submitted',
      value: formatDateTimeInSchoolTz(record.submitted_at),
    },
    { label: 'Status', value: record.status },
    ...(record.actioned_at
      ? [
          {
            label: 'Actioned',
            value: formatDateTimeInSchoolTz(record.actioned_at),
          },
        ]
      : []),
    ...(record.student_id
      ? [
          {
            label: 'Student',
            value: (
              <Link
                href={`/students/${record.student_id}/edit`}
                className="text-blue-600 hover:text-blue-800"
              >
                View student
              </Link>
            ),
          },
        ]
      : []),
    ...(record.rejected_reason
      ? [{ label: 'Rejected reason', value: record.rejected_reason }]
      : []),
  ]
}
