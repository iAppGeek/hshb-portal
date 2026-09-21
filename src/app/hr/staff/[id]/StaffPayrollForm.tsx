'use client'

import { useState } from 'react'

import type { StaffPayrollRow } from '@/db'
import {
  addYears,
  DBS_LEVEL_LABELS,
  DBS_RENEWAL_YEARS,
  ID_TYPE_LABELS,
  PAYMENT_FUNDING_LABELS,
} from '@/lib/compliance'
import type { ActionResult } from '@/lib/action'
import {
  CheckboxField,
  FieldError,
  FormActions,
  FormGrid,
  FormSection,
  SelectField,
  TextField,
  formStyles,
  useServerForm,
} from '@/components/form'

import SecretField from '../../_components/SecretField'

type Props = {
  payroll: StaffPayrollRow | null
  idVerifiedByName: string | null
  dbsVerifiedByName: string | null
  action: (formData: FormData) => Promise<ActionResult>
}

function optionsFromLabels(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }))
}

function verifiedByHint(name: string | null): string | undefined {
  return name ? `Verified by ${name}` : undefined
}

export default function StaffPayrollForm({
  payroll,
  idVerifiedByName,
  dbsVerifiedByName,
  action,
}: Props): React.ReactElement {
  const { handleSubmit, isPending, error, fieldError } = useServerForm(action)
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Payment">
        <FormGrid>
          <SelectField
            label="Payment funding"
            name="payment_funding"
            required
            defaultValue={payroll?.payment_funding}
            placeholder="Select…"
            options={optionsFromLabels(PAYMENT_FUNDING_LABELS)}
            error={fieldError('payment_funding')}
          />
          <TextField
            label="Payroll reference"
            name="payroll_ref"
            defaultValue={payroll?.payroll_ref}
            error={fieldError('payroll_ref')}
          />
        </FormGrid>
      </FormSection>

      <FormSection
        title="Bank details"
        description="Hidden by default. Use the eye button to check what was entered."
      >
        <FormGrid>
          <div className="sm:col-span-2">
            <TextField
              label="Account holder name"
              name="bank_account_name"
              defaultValue={payroll?.bank_account_name}
              error={fieldError('bank_account_name')}
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
        </FormGrid>
      </FormSection>

      <FormSection title="ID and right to work">
        <FormGrid>
          <div className="sm:col-span-2">
            <ControlledCheckbox
              label="ID verified"
              name="id_verified"
              checked={idVerified}
              onChange={setIdVerified}
              hint={verifiedByHint(idVerifiedByName)}
            />
          </div>
          <SelectField
            label="ID type"
            name="id_type"
            required={idVerified}
            defaultValue={payroll?.id_type}
            placeholder="Select…"
            options={optionsFromLabels(ID_TYPE_LABELS)}
            error={fieldError('id_type')}
          />
          <TextField
            label="ID verified on"
            name="id_verified_at"
            type="date"
            required={idVerified}
            defaultValue={payroll?.id_verified_at}
            error={fieldError('id_verified_at')}
          />
          <div className="hidden sm:block" />
          <div className="sm:col-span-2">
            <ControlledCheckbox
              label="Right to work checked"
              name="right_to_work_checked"
              checked={rightToWorkChecked}
              onChange={setRightToWorkChecked}
            />
          </div>
          <TextField
            label="Right to work checked on"
            name="right_to_work_checked_at"
            type="date"
            required={rightToWorkChecked}
            defaultValue={payroll?.right_to_work_checked_at}
            error={fieldError('right_to_work_checked_at')}
          />
        </FormGrid>
      </FormSection>

      <FormSection title="DBS">
        <FormGrid>
          <div className="sm:col-span-2">
            <ControlledCheckbox
              label="DBS verified"
              name="dbs_verified"
              checked={dbsVerified}
              onChange={setDbsVerified}
              hint={verifiedByHint(dbsVerifiedByName)}
            />
          </div>
          <SelectField
            label="DBS level"
            name="dbs_level"
            required={dbsVerified}
            defaultValue={payroll?.dbs_level}
            placeholder="Select…"
            options={optionsFromLabels(DBS_LEVEL_LABELS)}
            error={fieldError('dbs_level')}
          />
          <TextField
            label="DBS certificate reference"
            name="dbs_reference"
            required={dbsVerified}
            defaultValue={payroll?.dbs_reference}
            error={fieldError('dbs_reference')}
          />
          <div>
            <label htmlFor="dbs_issue_date" className={formStyles.label}>
              DBS issue date
              {dbsVerified && (
                <span className={formStyles.requiredMark}>*</span>
              )}
            </label>
            <input
              id="dbs_issue_date"
              name="dbs_issue_date"
              type="date"
              required={dbsVerified}
              value={dbsIssueDate}
              onChange={(e) => handleDbsIssueDateChange(e.target.value)}
              aria-invalid={fieldError('dbs_issue_date') ? true : undefined}
              aria-describedby={
                fieldError('dbs_issue_date')
                  ? 'dbs_issue_date-error'
                  : undefined
              }
              className={`${formStyles.input}${fieldError('dbs_issue_date') ? ` ${formStyles.inputInvalid}` : ''}`}
            />
            <FieldError
              id="dbs_issue_date-error"
              error={fieldError('dbs_issue_date')}
            />
          </div>
          <TextField
            label="DBS verified on"
            name="dbs_verified_at"
            type="date"
            required={dbsVerified}
            defaultValue={payroll?.dbs_verified_at}
            error={fieldError('dbs_verified_at')}
          />
          <div>
            <label htmlFor="dbs_renewal_due" className={formStyles.label}>
              DBS renewal due
            </label>
            <input
              id="dbs_renewal_due"
              name="dbs_renewal_due"
              type="date"
              value={dbsRenewalDue}
              onChange={(e) => setDbsRenewalDue(e.target.value)}
              className={formStyles.input}
            />
            <p className={formStyles.hint}>
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
        </FormGrid>
      </FormSection>

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
        fieldError={fieldError}
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
        fieldError={fieldError}
      />

      <FormActions
        submitLabel="Save payroll record"
        isPending={isPending}
        cancelHref="/hr"
        error={error ?? undefined}
      />
    </form>
  )
}

/**
 * The kit's `CheckboxField` is uncontrolled (`defaultChecked` only); several
 * checks here drive a dependent field's `required` state, so they need to
 * stay controlled. Styled to match `CheckboxField` exactly.
 */
function ControlledCheckbox({
  label,
  name,
  checked,
  onChange,
  hint,
}: {
  label: string
  name: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
}): React.ReactElement {
  return (
    <div className="flex items-start gap-2">
      <input
        id={name}
        name={name}
        type="checkbox"
        value="on"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <div>
        <label htmlFor={name} className={formStyles.label}>
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
  fieldError,
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
  fieldError: (name: string) => string | undefined
}): React.ReactElement {
  const [certified, setCertified] = useState(values.certified)
  return (
    <FormSection title={title}>
      <FormGrid>
        <div className="sm:col-span-2">
          <ControlledCheckbox
            label={`${title} certified`}
            name={`${prefix}_certified`}
            checked={certified}
            onChange={setCertified}
          />
        </div>
        <TextField
          label={`${title} certificate reference`}
          name={`${prefix}_reference`}
          required={certified}
          defaultValue={values.reference}
          error={fieldError(`${prefix}_reference`)}
        />
        <TextField
          label={`${title} issue date`}
          name={`${prefix}_issue_date`}
          type="date"
          required={certified}
          defaultValue={values.issueDate}
          error={fieldError(`${prefix}_issue_date`)}
        />
        <TextField
          label={`${title} verified on`}
          name={`${prefix}_verified_at`}
          type="date"
          required={certified}
          defaultValue={values.verifiedAt}
          error={fieldError(`${prefix}_verified_at`)}
        />
        <TextField
          label={`${title} expiry date`}
          name={`${prefix}_expiry_date`}
          type="date"
          defaultValue={values.expiryDate}
          error={fieldError(`${prefix}_expiry_date`)}
        />
      </FormGrid>
    </FormSection>
  )
}
