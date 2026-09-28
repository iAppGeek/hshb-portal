import Link from 'next/link'

import { canEditGuardians } from '@/lib/permissions'
import type { StaffRole } from '@/types/next-auth'

import AddressBlock from './AddressBlock'

type Props = {
  firstName: string
  lastName: string
  phone: string
  id: string | null
  relationship: string | null
  role: StaffRole
  email?: string | null
  occupation?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  postcode?: string | null
}

export default function GuardianCard({
  firstName,
  lastName,
  phone,
  id,
  relationship,
  role,
  email,
  occupation,
  addressLine1,
  addressLine2,
  city,
  postcode,
}: Props): React.ReactElement {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-gray-900">
          {firstName} {lastName}
          {relationship && (
            <span className="ml-1 font-normal text-gray-500">
              ({relationship})
            </span>
          )}
        </p>
        {canEditGuardians(role) && id && (
          <Link
            href={`/guardians/${id}/edit`}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Edit
          </Link>
        )}
      </div>
      {occupation && <p className="text-sm text-gray-500">{occupation}</p>}
      {email && <p className="text-sm text-gray-600">{email}</p>}
      <a
        href={`tel:${phone}`}
        className="text-sm text-blue-600 hover:text-blue-800"
      >
        {phone}
      </a>
      {(addressLine1 || city || postcode) && (
        <AddressBlock
          address_line_1={addressLine1 ?? null}
          address_line_2={addressLine2 ?? null}
          city={city ?? null}
          postcode={postcode ?? null}
        />
      )}
    </div>
  )
}
