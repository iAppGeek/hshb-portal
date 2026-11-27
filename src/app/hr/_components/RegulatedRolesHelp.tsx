import { QuestionMarkCircleIcon } from '@heroicons/react/20/solid'

import InfoPopover from '@/components/InfoPopover'
import { JOB_ROLE_LABELS, type JobRole } from '@/lib/compliance'
import { isRegulatedRole } from '@/lib/hrStatus'

const ROLES = Object.keys(JOB_ROLE_LABELS) as JobRole[]

function roleList(roles: JobRole[]): string {
  return roles.map((role) => JOB_ROLE_LABELS[role]).join(', ')
}

/** Explains which job roles are regulated and so need an enhanced DBS. */
export default function RegulatedRolesHelp(): React.ReactElement {
  return (
    <InfoPopover
      className="inline-flex items-center gap-1 text-sm text-gray-600"
      content={
        <dl className="space-y-2">
          <div>
            <dt className="font-semibold">Regulated: enhanced DBS required</dt>
            <dd>{roleList(ROLES.filter(isRegulatedRole))}</dd>
          </div>
          <div>
            <dt className="font-semibold">Not regulated: DBS not compulsory</dt>
            <dd>{roleList(ROLES.filter((role) => !isRegulatedRole(role)))}</dd>
          </div>
        </dl>
      }
    >
      <QuestionMarkCircleIcon
        className="h-5 w-5 text-gray-400"
        aria-hidden="true"
      />
      Which roles need a DBS?
    </InfoPopover>
  )
}
