import { type Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSession } from '@/auth/require'
import { getStaffById, getStudentById, getStudentIdsByTeacher } from '@/db'
import DefinitionList from '@/components/DefinitionList'
import PermissionedLink from '@/components/PermissionedLink'
import { consentItems } from '@/lib/consents'
import { formatDateTimeInSchoolTz } from '@/lib/datetime'
import { personName } from '@/lib/format'
import {
  canEditStudents,
  canSeeStudentMedical,
  isTeacher,
} from '@/lib/permissions'
import { resolveStudentAddress } from '@/lib/student-address'

import PageHeader from '../../_components/PageHeader'
import SectionCard from '../../_components/SectionCard'

import AddressBlock from './_components/AddressBlock'
import GuardianCard from './_components/GuardianCard'
import WithdrawPhotoConsentButton from './_components/WithdrawPhotoConsentButton'

export const metadata: Metadata = { title: 'Student' }

export default async function StudentPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<React.ReactElement> {
  const actor = await requireSession()
  const role = actor.role

  const { id } = await params

  if (isTeacher(role)) {
    const studentIds = await getStudentIdsByTeacher(actor.staffId)
    if (!studentIds.includes(id)) notFound()
  }

  const student = await getStudentById(id)
  if (!student) notFound()

  const withdrawnBy =
    student.photo_video_consent_withdrawn_by && canSeeStudentMedical(role)
      ? await getStaffById(student.photo_video_consent_withdrawn_by)
      : null

  const resolvedAddress = resolveStudentAddress(student)
  const hasStudentAddress = Boolean(
    resolvedAddress.address_line_1 ||
    resolvedAddress.city ||
    resolvedAddress.postcode,
  )
  const classNames =
    student.student_classes.length > 0
      ? student.student_classes
          .map((sc) => {
            if (!sc.class) return null
            return sc.class.academic_year
              ? `${sc.class.name} (${sc.class.academic_year})`
              : sc.class.name
          })
          .filter(Boolean)
          .join(', ')
      : 'None'

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title={`${student.last_name}, ${student.first_name}`}
        subtitle={student.student_code}
        backHref="/students"
        backLabel="Students"
        action={
          <PermissionedLink
            href={`/students/${id}/edit`}
            allowed={canEditStudents(role)}
            showDisabled={!isTeacher(role)}
            disabledReason="You don't have permission to edit students"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            Edit
          </PermissionedLink>
        }
      />

      <SectionCard title="Details">
        <DefinitionList
          items={[
            {
              label: 'English (mainstream) school',
              value: student.english_school_name ?? '—',
            },
            { label: 'Allergies', value: student.allergies ?? 'N/A' },
          ]}
        />
      </SectionCard>

      {hasStudentAddress && (
        <SectionCard title="Address">
          <div className="p-6">
            {student.address_guardian_id && (
              <p className="mb-2 text-xs text-gray-400">(from guardian)</p>
            )}
            <AddressBlock
              address_line_1={resolvedAddress.address_line_1}
              address_line_2={resolvedAddress.address_line_2}
              city={resolvedAddress.city}
              postcode={resolvedAddress.postcode}
            />
          </div>
        </SectionCard>
      )}

      <SectionCard title="Classes">
        <p className="p-6 text-sm text-gray-600">{classNames}</p>
      </SectionCard>

      <SectionCard title="Guardians & contacts">
        <div className="space-y-4 p-6">
          <div>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase">
              Primary Guardian
            </h3>
            {student.primary_guardian ? (
              <GuardianCard
                firstName={student.primary_guardian.first_name}
                lastName={student.primary_guardian.last_name}
                phone={student.primary_guardian.phone}
                id={student.primary_guardian_id}
                relationship={student.primary_guardian_relationship}
                role={role}
                email={student.primary_guardian.email}
                occupation={student.primary_guardian.occupation}
                addressLine1={student.primary_guardian.address_line_1}
                addressLine2={student.primary_guardian.address_line_2}
                city={student.primary_guardian.city}
                postcode={student.primary_guardian.postcode}
              />
            ) : (
              <p className="text-sm text-gray-400">No details recorded.</p>
            )}
          </div>

          {student.secondary_guardian && (
            <div className="border-t border-gray-100 pt-4">
              <h3 className="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase">
                Secondary Guardian
              </h3>
              <GuardianCard
                firstName={student.secondary_guardian.first_name}
                lastName={student.secondary_guardian.last_name}
                phone={student.secondary_guardian.phone}
                id={student.secondary_guardian_id}
                relationship={student.secondary_guardian_relationship}
                role={role}
                email={student.secondary_guardian.email}
                occupation={student.secondary_guardian.occupation}
                addressLine1={student.secondary_guardian.address_line_1}
                addressLine2={student.secondary_guardian.address_line_2}
                city={student.secondary_guardian.city}
                postcode={student.secondary_guardian.postcode}
              />
            </div>
          )}

          {student.additional_contact_1 && (
            <div className="border-t border-gray-100 pt-4">
              <h3 className="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase">
                Additional Contact 1
              </h3>
              <GuardianCard
                firstName={student.additional_contact_1.first_name}
                lastName={student.additional_contact_1.last_name}
                phone={student.additional_contact_1.phone}
                id={student.additional_contact_1_id}
                relationship={student.additional_contact_1_relationship}
                role={role}
              />
            </div>
          )}

          {student.additional_contact_2 && (
            <div className="border-t border-gray-100 pt-4">
              <h3 className="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase">
                Additional Contact 2
              </h3>
              <GuardianCard
                firstName={student.additional_contact_2.first_name}
                lastName={student.additional_contact_2.last_name}
                phone={student.additional_contact_2.phone}
                id={student.additional_contact_2_id}
                relationship={student.additional_contact_2_relationship}
                role={role}
              />
            </div>
          )}
        </div>
      </SectionCard>

      {canSeeStudentMedical(role) && (
        <>
          <SectionCard title="Medical">
            <DefinitionList
              items={[
                {
                  label: 'Medical details',
                  value: student.medical_details ?? '—',
                },
                {
                  label: 'Special educational needs or disability',
                  value: student.sen_details ?? '—',
                },
              ]}
            />
          </SectionCard>

          <SectionCard title="Consents">
            <DefinitionList
              items={[
                ...consentItems(student),
                ...(student.photo_video_consent_withdrawn_at
                  ? [
                      {
                        label: 'Photo consent withdrawn',
                        value: `${formatDateTimeInSchoolTz(student.photo_video_consent_withdrawn_at)}${withdrawnBy ? ` by ${personName(withdrawnBy)}` : ''}`,
                      },
                    ]
                  : []),
              ]}
            />
            {student.photo_video_consent && canEditStudents(role) && (
              <div className="border-t border-gray-100 px-6 py-4">
                <WithdrawPhotoConsentButton studentId={student.id} />
              </div>
            )}
          </SectionCard>

          <SectionCard title="Notes">
            <DefinitionList
              items={[{ label: 'Notes', value: student.notes ?? '—' }]}
            />
          </SectionCard>
        </>
      )}
    </div>
  )
}
