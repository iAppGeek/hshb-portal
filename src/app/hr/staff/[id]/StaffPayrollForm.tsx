'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'

import type { StaffPayrollRow } from '@/db'
import {
  addYears,
  DBS_LEVEL_LABELS,
  DBS_RENEWAL_YEARS,
  ID_TYPE_LABELS,
  PAYMENT_FUNDING_LABELS,
} from '@/lib/compliance'
import type { ActionResult } from '@/lib/schemas'

import SecretField from '../../_components/SecretField'

type Props = {
  payroll: StaffPayrollRow | null
  idVerifiedByName: string | null
  dbsVerifiedByName: string | null
  action: (formData: FormData) => Promise<ActionResult>
}

const INPUT =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
const LABEL = 'block text-sm font-medium text-gray-700'

export default function StaffPayrollForm({
  payroll,
  idVerifiedByName,
  dbsVerifiedByName,
  action,
}: Props): React.ReactElement {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [dbsIssueDate, setDbsIssueDate] = useState(
    payroll?.dbs_issue_date ?? '',
  )
  const [dbsRenewalDue, setDbsRenewalDue] = useState(
    payroll?.dbs_renewal_due ?? '',
  )
  // A ticked check makes its supporting details required, mirroring the
  // schema and the DB CHECK constraints so the browser catches gaps first.
  const [idVerified, setIdVerified] = useState(payroll?.id_verified ?? false)
  const [rightToWorkChecked, setRightToWorkChecked] = useState(
    payroll?.right_to_work_checked ?? false,
  )
  const [dbsVerified, setDbsVerified] = useState(payroll?.dbs_verified ?? false)

  function handleDbsIssueDateChange(value: string): void {
    const previousDefault = dbsIssueDate
      ? addYears(dbsIssueDate, DBS_RENEWAL_YEARS)
      : ''
    setDbsIssueDate(value)
    // Follow the issue date until the admin picks a renewal date of their own.
    if (value && (!dbsRenewalDue || dbsRenewalDue === previousDefault)) {
      setDbsRenewalDue(addYears(value, DBS_RENEWAL_YEARS))
    }
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await action(new FormData(form))
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Section title="Payment">
        <SelectField
          label="Payment funding"
          name="payment_funding"
          required
          defaultValue={payroll?.payment_funding ?? ''}
          options={PAYMENT_FUNDING_LABELS}
        />
        <TextField
          label="Payroll reference"
          name="payroll_ref"
          defaultValue={payroll?.payroll_ref}
        />
      </Section>

      <Section
        title="Bank details"
        description="Hidden by default. Use the eye button to check what was entered."
      >
        <div className="sm:col-span-2">
          <TextField
            label="Account holder name"
            name="bank_account_name"
            defaultValue={payroll?.bank_account_name}
          />
        </div>
        <SecretField
          label="Sort code"
          name="bank_sort_code"
          defaultValue={payroll?.bank_sort_code ?? null}
          maxLength={8}
        />
        <SecretField
          label="Account number"
          name="bank_account_number"
          defaultValue={payroll?.bank_account_number ?? null}
          maxLength={10}
        />
      </Section>

      <Section title="ID and right to work">
        <CheckboxField
          label="ID verified"
          name="id_verified"
          checked={idVerified}
          onChange={setIdVerified}
          hint={verifiedByHint(idVerifiedByName)}
        />
        <SelectField
          label="ID type"
          name="id_type"
          required={idVerified}
          defaultValue={payroll?.id_type ?? ''}
          options={ID_TYPE_LABELS}
        />
        <TextField
          label="ID verified on"
          name="id_verified_at"
          type="date"
          required={idVerified}
          defaultValue={payroll?.id_verified_at}
        />
        <div className="hidden sm:block" />
        <CheckboxField
          label="Right to work checked"
          name="right_to_work_checked"
          checked={rightToWorkChecked}
          onChange={setRightToWorkChecked}
        />
        <TextField
          label="Right to work checked on"
          name="right_to_work_checked_at"
          type="date"
          required={rightToWorkChecked}
          defaultValue={payroll?.right_to_work_checked_at}
        />
      </Section>

      <Section title="DBS">
        <CheckboxField
          label="DBS verified"
          name="dbs_verified"
          checked={dbsVerified}
          onChange={setDbsVerified}
          hint={verifiedByHint(dbsVerifiedByName)}
        />
        <SelectField
          label="DBS level"
          name="dbs_level"
          required={dbsVerified}
          defaultValue={payroll?.dbs_level ?? ''}
          options={DBS_LEVEL_LABELS}
        />
        <TextField
          label="DBS certificate reference"
          name="dbs_reference"
          required={dbsVerified}
          defaultValue={payroll?.dbs_reference}
        />
        <div>
          <label htmlFor="dbs_issue_date" className={LABEL}>
            DBS issue date
            {dbsVerified && <RequiredMark />}
          </label>
          <input
            id="dbs_issue_date"
            name="dbs_issue_date"
            type="date"
            required={dbsVerified}
            value={dbsIssueDate}
            onChange={(e) => handleDbsIssueDateChange(e.target.value)}
            className={INPUT}
          />
        </div>
        <TextField
          label="DBS verified on"
          name="dbs_verified_at"
          type="date"
          required={dbsVerified}
          defaultValue={payroll?.dbs_verified_at}
        />
        <div>
          <label htmlFor="dbs_renewal_due" className={LABEL}>
            DBS renewal due
          </label>
          <input
            id="dbs_renewal_due"
            name="dbs_renewal_due"
            type="date"
            value={dbsRenewalDue}
            onChange={(e) => setDbsRenewalDue(e.target.value)}
            className={INPUT}
          />
          <p className="mt-1 text-xs text-gray-500">
            Defaults to {DBS_RENEWAL_YEARS} years after the issue date.
          </p>
        </div>
        <CheckboxField
          label="Barred list checked"
          name="dbs_barred_list_checked"
          defaultChecked={payroll?.dbs_barred_list_checked ?? false}
        />
        <CheckboxField
          label="Enrolled in the DBS Update Service"
          name="dbs_update_service"
          defaultChecked={payroll?.dbs_update_service ?? false}
        />
      </Section>

      <CertificateSection
        title="First aid"
        prefix="first_aid"
        values={{
          certified: payroll?.first_aid_certified ?? false,
          reference: payroll?.first_aid_reference ?? null,
          issueDate: payroll?.first_aid_issue_date ?? null,
          verifiedAt: payroll?.first_aid_verified_at ?? null,
          expiryDate: payroll?.first_aid_expiry_date ?? null,
        }}
      />

      <CertificateSection
        title="Fire warden"
        prefix="fire_warden"
        values={{
          certified: payroll?.fire_warden_certified ?? false,
          reference: payroll?.fire_warden_reference ?? null,
          issueDate: payroll?.fire_warden_issue_date ?? null,
          verifiedAt: payroll?.fire_warden_verified_at ?? null,
          expiryDate: payroll?.fire_warden_expiry_date ?? null,
        }}
      />

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save payroll record'}
        </button>
        <Link
          href="/hr"
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Cancel
        </Link>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}

function RequiredMark(): React.ReactElement {
  return <span className="ml-0.5 text-red-500">*</span>
}

function verifiedByHint(name: string | null): string | undefined {
  return name ? `Verified by ${name}` : undefined
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <fieldset className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <legend className="sr-only">{title}</legend>
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {children}
      </div>
    </fieldset>
  )
}

function TextField({
  label,
  name,
  type = 'text',
  required = false,
  defaultValue,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  defaultValue?: string | null
}): React.ReactElement {
  return (
    <div>
      <label htmlFor={name} className={LABEL}>
        {label}
        {required && <RequiredMark />}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ''}
        className={INPUT}
      />
    </div>
  )
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  required = false,
}: {
  label: string
  name: string
  defaultValue: string
  options: Record<string, string>
  required?: boolean
}): React.ReactElement {
  return (
    <div>
      <label htmlFor={name} className={LABEL}>
        {label}
        {required && <RequiredMark />}
      </label>
      <select
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue}
        className={INPUT}
      >
        <option value="">Select…</option>
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  )
}

type CheckboxFieldProps = {
  label: string
  name: string
  hint?: string
} & (
  | { defaultChecked: boolean; checked?: never; onChange?: never }
  | { checked: boolean; onChange: (checked: boolean) => void }
)

function CheckboxField({
  label,
  name,
  hint,
  ...state
}: CheckboxFieldProps): React.ReactElement {
  return (
    <div className="flex items-start gap-2 sm:col-span-2">
      <input
        id={name}
        name={name}
        type="checkbox"
        {...('onChange' in state && state.onChange
          ? {
              checked: state.checked,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                state.onChange(e.target.checked),
            }
          : { defaultChecked: state.defaultChecked })}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <div>
        <label htmlFor={name} className="text-sm font-medium text-gray-700">
          {label}
        </label>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    </div>
  )
}

function CertificateSection({
  title,
  prefix,
  values,
}: {
  title: string
  prefix: string
  values: {
    certified: boolean
    reference: string | null
    issueDate: string | null
    verifiedAt: string | null
    expiryDate: string | null
  }
}): React.ReactElement {
  const [certified, setCertified] = useState(values.certified)
  return (
    <Section title={title}>
      <CheckboxField
        label={`${title} certified`}
        name={`${prefix}_certified`}
        checked={certified}
        onChange={setCertified}
      />
      <TextField
        label={`${title} certificate reference`}
        name={`${prefix}_reference`}
        required={certified}
        defaultValue={values.reference}
      />
      <TextField
        label={`${title} issue date`}
        name={`${prefix}_issue_date`}
        type="date"
        required={certified}
        defaultValue={values.issueDate}
      />
      <TextField
        label={`${title} verified on`}
        name={`${prefix}_verified_at`}
        type="date"
        required={certified}
        defaultValue={values.verifiedAt}
      />
      <TextField
        label={`${title} expiry date`}
        name={`${prefix}_expiry_date`}
        type="date"
        defaultValue={values.expiryDate}
      />
    </Section>
  )
}
