import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { StaffPayrollRow } from '@/db'

import StaffPayrollForm from './StaffPayrollForm'

// Labels gain a required asterisk when their check is ticked, so match the
// exact label with an optional trailing asterisk.
function input(label: string): HTMLInputElement {
  return screen.getByLabelText(new RegExp(`^${label}\\*?$`)) as HTMLInputElement
}

function renderForm(
  overrides: Partial<React.ComponentProps<typeof StaffPayrollForm>> = {},
): void {
  render(
    <StaffPayrollForm
      payroll={null}
      idVerifiedByName={null}
      dbsVerifiedByName={null}
      action={vi.fn()}
      {...overrides}
    />,
  )
}

describe('StaffPayrollForm', () => {
  it('renders an empty form for a staff member without a record', () => {
    renderForm()

    expect(input('Payment funding').value).toBe('')
    expect(input('Sort code').type).toBe('password')
    expect(input('ID verified').checked).toBe(false)
    expect(input('First aid expiry date').name).toBe('first_aid_expiry_date')
    expect(input('Fire warden certified').name).toBe('fire_warden_certified')
    expect(screen.queryByText(/Verified by/)).toBeNull()
  })

  it('prefills an existing record and shows who verified it', () => {
    renderForm({
      payroll: {
        payment_funding: 'kea',
        bank_sort_code: '123456',
        id_verified: true,
        id_type: 'passport',
        dbs_verified: true,
        dbs_issue_date: '2025-01-01',
        dbs_renewal_due: '2027-06-01',
        dbs_barred_list_checked: true,
        first_aid_certified: true,
        first_aid_expiry_date: '2027-01-01',
      } as StaffPayrollRow,
      idVerifiedByName: 'Ann Admin',
      dbsVerifiedByName: 'Bob Admin',
    })

    expect(input('Payment funding').value).toBe('kea')
    expect(input('Sort code').value).toBe('123456')
    expect(input('ID verified').checked).toBe(true)
    expect(input('Barred list checked').checked).toBe(true)
    expect(screen.getByText('Verified by Ann Admin')).toBeTruthy()
    expect(screen.getByText('Verified by Bob Admin')).toBeTruthy()
    expect(input('DBS renewal due').value).toBe('2027-06-01')
    expect(input('First aid expiry date').value).toBe('2027-01-01')
  })

  it('makes supporting details required while a check is ticked', () => {
    renderForm()

    const idDetails = [input('ID type'), input('ID verified on')]
    expect(idDetails.every((el) => !el.required)).toBe(true)
    fireEvent.click(input('ID verified'))
    expect(idDetails.every((el) => el.required)).toBe(true)
    expect(screen.getByLabelText('ID type*')).toBeTruthy()
    fireEvent.click(input('ID verified'))
    expect(idDetails.every((el) => !el.required)).toBe(true)

    fireEvent.click(input('Right to work checked'))
    expect(input('Right to work checked on').required).toBe(true)

    const dbsDetails = [
      input('DBS level'),
      input('DBS certificate reference'),
      input('DBS issue date'),
      input('DBS verified on'),
    ]
    fireEvent.click(input('DBS verified'))
    expect(dbsDetails.every((el) => el.required)).toBe(true)
    expect(input('DBS renewal due').required).toBe(false)

    fireEvent.click(input('Fire warden certified'))
    expect(input('Fire warden certificate reference').required).toBe(true)
    expect(input('Fire warden issue date').required).toBe(true)
    expect(input('Fire warden verified on').required).toBe(true)
    expect(input('Fire warden expiry date').required).toBe(false)
    expect(input('First aid certificate reference').required).toBe(false)
  })

  it('starts with details required for checks already on the record', () => {
    renderForm({
      payroll: { first_aid_certified: true } as StaffPayrollRow,
    })
    expect(input('First aid issue date').required).toBe(true)
  })

  it('defaults the DBS renewal to three years after issue until edited', () => {
    renderForm()

    fireEvent.change(input('DBS issue date'), {
      target: { value: '2026-03-01' },
    })
    expect(input('DBS renewal due').value).toBe('2029-03-01')

    // Still following the issue date
    fireEvent.change(input('DBS issue date'), {
      target: { value: '2026-04-01' },
    })
    expect(input('DBS renewal due').value).toBe('2029-04-01')

    // A manual renewal date is kept when the issue date changes again
    fireEvent.change(input('DBS renewal due'), {
      target: { value: '2027-01-01' },
    })
    fireEvent.change(input('DBS issue date'), {
      target: { value: '2026-05-01' },
    })
    expect(input('DBS renewal due').value).toBe('2027-01-01')
  })

  it('submits the form data and shows an action error', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'Enter the sort code' })
    renderForm({ action })

    fireEvent.change(input('Payment funding'), {
      target: { value: 'school' },
    })
    fireEvent.click(input('Right to work checked'))
    fireEvent.change(input('Right to work checked on'), {
      target: { value: '2026-09-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save payroll record' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Enter the sort code'),
    )
    const fd = action.mock.calls[0][0] as FormData
    expect(fd.get('payment_funding')).toBe('school')
    expect(fd.get('right_to_work_checked')).toBe('on')
    expect(fd.get('right_to_work_checked_at')).toBe('2026-09-01')
    expect(fd.get('id_verified')).toBeNull()
  })

  it('shows bank-detail field errors under the masked inputs', async () => {
    const action = vi.fn().mockResolvedValue({
      error: 'Enter the sort code',
      fieldErrors: { bank_sort_code: 'Enter the sort code' },
    })
    renderForm({ action })

    fireEvent.change(input('Payment funding'), {
      target: { value: 'school' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save payroll record' }))

    await waitFor(() =>
      expect(input('Sort code')).toHaveAttribute('aria-invalid', 'true'),
    )
    expect(input('Sort code')).toHaveAttribute(
      'aria-describedby',
      'bank_sort_code-error',
    )
    expect(document.getElementById('bank_sort_code-error')).toHaveTextContent(
      'Enter the sort code',
    )
    expect(input('Account number')).not.toHaveAttribute('aria-invalid')
  })

  it('does not submit while a ticked check is missing its details', () => {
    const action = vi.fn()
    renderForm({ action })

    fireEvent.change(input('Payment funding'), {
      target: { value: 'school' },
    })
    fireEvent.click(input('DBS verified'))
    fireEvent.click(screen.getByRole('button', { name: 'Save payroll record' }))

    expect(action).not.toHaveBeenCalled()
  })

  it('clears the error after a successful save', async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce({ error: 'Nope' })
      .mockResolvedValueOnce(undefined)
    renderForm({ action })
    fireEvent.change(input('Payment funding'), {
      target: { value: 'school' },
    })
    const save = screen.getByRole('button', { name: 'Save payroll record' })

    fireEvent.click(save)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    // The button stays disabled until the first save's transition settles
    await waitFor(() =>
      expect((save as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(save)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
