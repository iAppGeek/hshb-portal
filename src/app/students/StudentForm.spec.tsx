import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import StudentForm, { type StudentFormData } from './StudentForm'

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const guardians = [
  {
    id: 'guardian-1',
    first_name: 'Maria',
    last_name: 'Smith',
    phone: '07700 900000',
    email: 'maria@example.com',
  },
  {
    id: 'guardian-2',
    first_name: 'George',
    last_name: 'Jones',
    phone: '07700 900001',
    email: 'george@example.com',
  },
]

const classes = [
  { id: 'class-1', name: 'Year 1A', year_group: '1' },
  { id: 'class-2', name: 'Year 2B', year_group: '2' },
]

const baseStudent: StudentFormData = {
  id: 'student-1',
  active: true,
  first_name: 'Anna',
  last_name: 'Papadopoulos',
  student_code: 'S001',
  date_of_birth: null,
  english_school_name: 'St Marys Primary',
  address_guardian_id: null,
  address_line_1: '1 Main Street',
  address_line_2: null,
  city: 'London',
  postcode: 'EC1A 1BB',
  allergies: null,
  medical_details: null,
  sen_details: null,
  notes: null,
  primary_guardian_id: 'guardian-1',
  primary_guardian_relationship: 'Mother',
  secondary_guardian_id: null,
  secondary_guardian_relationship: null,
  additional_contact_1_id: null,
  additional_contact_1_relationship: null,
  additional_contact_2_id: null,
  additional_contact_2_relationship: null,
  privacy_notice_read: false,
  first_aid_consent: false,
  photo_video_consent: false,
  home_school_agreement: false,
  email_sms_contact_ack: false,
  may_leave_unaccompanied: false,
  updated_at: '2026-10-01 09:30:00.123456+00',
}

function renderNew(action = vi.fn()): ReturnType<typeof render> {
  return render(
    <StudentForm
      guardians={[]}
      classes={classes}
      suggestedCode="GK-1006"
      action={action}
      submitLabel="Save student"
    />,
  )
}

function renderEdit(
  student: StudentFormData = baseStudent,
  props: Partial<React.ComponentProps<typeof StudentForm>> = {},
): ReturnType<typeof render> {
  return render(
    <StudentForm
      initial={student}
      guardians={guardians}
      action={vi.fn()}
      submitLabel="Save changes"
      {...props}
    />,
  )
}

function occupationRequired(container: HTMLElement, prefix: string): boolean {
  const input = container.querySelector(
    `input[name="${prefix}_occupation"]`,
  ) as HTMLInputElement
  return input.required
}

describe('StudentForm without initial (new student)', () => {
  it('renders the student and primary guardian sections', () => {
    renderNew()
    expect(screen.getByText('Student Details')).toBeTruthy()
    expect(screen.getByText('Primary Guardian')).toBeTruthy()
    expect(screen.getAllByLabelText(/First name/).length).toBeGreaterThan(0)
  })

  it('has no classes or consents sections', () => {
    const { container } = renderNew()
    expect(screen.queryByText('Classes')).toBeNull()
    expect(screen.queryByText('Consents')).toBeNull()
    expect(container.querySelector('[name="class_ids"]')).toBeNull()
    expect(container.querySelector('[name^="consent_"]')).toBeNull()
  })

  it('pre-fills a required student code with the suggestion', () => {
    const { container } = renderNew()
    const input = container.querySelector(
      'input[name="student_code"]',
    ) as HTMLInputElement
    expect(input.value).toBe('GK-1006')
    expect(input.required).toBe(true)
  })

  // Optional for admin data entry, unlike the public registration form.
  it('renders an optional English school field', () => {
    const { container } = renderNew()
    const input = container.querySelector(
      'input[name="student_english_school_name"]',
    ) as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.required).toBe(false)
  })

  it('starts on the guardian address', () => {
    const { container } = renderNew()
    expect(
      screen.getByText("Student will use the primary guardian's address."),
    ).toBeTruthy()
    expect(
      (
        container.querySelector(
          'input[name="address_guardian_id"]',
        ) as HTMLInputElement
      ).value,
    ).toBe('primary')
  })

  it('requires an occupation for guardians but not additional contacts', () => {
    const { container } = renderNew()
    fireEvent.click(screen.getByText('+ Add secondary guardian'))
    fireEvent.click(screen.getByText('+ Add additional contact'))

    expect(occupationRequired(container, 'primary')).toBe(true)
    expect(occupationRequired(container, 'secondary')).toBe(true)
    expect(occupationRequired(container, 'contact1')).toBe(false)
  })

  it('adds and removes the secondary guardian', () => {
    const { container } = renderNew()
    const hasSecondary = (): string =>
      (
        container.querySelector(
          'input[name="has_secondary"]',
        ) as HTMLInputElement
      ).value
    expect(screen.queryByText('Secondary Guardian')).toBeNull()
    expect(hasSecondary()).toBe('false')

    fireEvent.click(screen.getByText('+ Add secondary guardian'))
    expect(screen.getByText('Secondary Guardian')).toBeTruthy()
    expect(hasSecondary()).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByText('Secondary Guardian')).toBeNull()
  })

  it('offers the second contact only after the first', () => {
    renderNew()
    expect(screen.queryByText('Additional Contact 1')).toBeNull()
    expect(screen.queryByText('+ Add second additional contact')).toBeNull()

    fireEvent.click(screen.getByText('+ Add additional contact'))
    expect(screen.getByText('Additional Contact 1')).toBeTruthy()
    fireEvent.click(screen.getByText('+ Add second additional contact'))
    expect(screen.getByText('Additional Contact 2')).toBeTruthy()
  })

  it('hides the guardian mode toggle when there are no guardians', () => {
    renderNew()
    expect(screen.queryByLabelText('Select existing')).toBeNull()
  })

  it('renders the submit label and a Cancel link to the students list', () => {
    renderNew()
    expect(screen.getByRole('button', { name: 'Save student' })).toBeTruthy()
    const link = screen.getByText('Cancel').closest('a')
    expect(link?.getAttribute('href')).toBe('/students')
  })

  it('shows the error the action returns', async () => {
    const action = vi.fn().mockResolvedValue({
      error: 'Failed to save student. Please try again.',
    })
    renderNew(action)

    fireEvent.submit(
      screen.getByRole('button', { name: 'Save student' }).closest('form')!,
    )

    await screen.findByText('Failed to save student. Please try again.')
  })
})

describe('StudentForm with initial (editing)', () => {
  it('pre-fills the student details', () => {
    const { container } = renderEdit()
    expect((screen.getByDisplayValue('Anna') as HTMLInputElement).name).toBe(
      'student_first_name',
    )
    expect(
      (screen.getByDisplayValue('Papadopoulos') as HTMLInputElement).name,
    ).toBe('student_last_name')
    const school = container.querySelector(
      'input[name="student_english_school_name"]',
    ) as HTMLInputElement
    expect(school.value).toBe('St Marys Primary')
    expect(school.required).toBe(false)
  })

  it('keeps the student code over the suggestion', () => {
    const { container } = renderEdit(baseStudent, { suggestedCode: 'GK-1006' })
    expect(
      (
        container.querySelector(
          'input[name="student_code"]',
        ) as HTMLInputElement
      ).value,
    ).toBe('S001')
  })

  it('suggests a code for a student who has none', () => {
    const { container } = renderEdit(
      { ...baseStudent, student_code: null },
      { suggestedCode: 'GK-1006' },
    )
    expect(
      (
        container.querySelector(
          'input[name="student_code"]',
        ) as HTMLInputElement
      ).value,
    ).toBe('GK-1006')
  })

  it('starts on the own address when the student has one', () => {
    renderEdit()
    expect(
      (screen.getByLabelText(/Address line 1/) as HTMLInputElement).value,
    ).toBe('1 Main Street')
  })

  it('starts on the guardian address when the student links to one', () => {
    renderEdit({ ...baseStudent, address_guardian_id: 'guardian-1' })
    expect(
      screen.getByText("Student will use the primary guardian's address."),
    ).toBeTruthy()
  })

  it('opens the optional sections the student already has', () => {
    renderEdit({
      ...baseStudent,
      secondary_guardian_id: 'guardian-2',
      additional_contact_1_id: 'guardian-2',
    })
    expect(screen.getByText('Secondary Guardian')).toBeTruthy()
    expect(screen.getByText('Additional Contact 1')).toBeTruthy()
    expect(screen.queryByText('Additional Contact 2')).toBeNull()
  })

  it('shows an Edit guardian link only for a pre-selected guardian', () => {
    const { unmount } = renderEdit()
    expect(
      screen.getByRole('link', { name: 'Edit guardian' }).getAttribute('href'),
    ).toBe('/guardians/guardian-1/edit')
    unmount()

    renderEdit({ ...baseStudent, primary_guardian_id: null })
    expect(screen.queryByRole('link', { name: 'Edit guardian' })).toBeNull()
  })

  // A pre-selected guardian renders in "existing" mode, which collects no
  // details, so this exercises the "new guardian" branch.
  it('requires an occupation for guardians but not additional contacts', () => {
    const { container } = renderEdit({
      ...baseStudent,
      primary_guardian_id: null,
    })
    fireEvent.click(screen.getByText('+ Add secondary guardian'))
    fireEvent.click(screen.getByText('+ Add additional contact'))

    expect(occupationRequired(container, 'primary')).toBe(true)
    expect(occupationRequired(container, 'secondary')).toBe(true)
    expect(occupationRequired(container, 'contact1')).toBe(false)
  })

  it('shows the submit label and Cancel', () => {
    renderEdit()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Cancel' })).toBeTruthy()
  })

  it('renders class checkboxes with enrolled ones pre-checked', () => {
    renderEdit(baseStudent, { classes, enrolledClassIds: ['class-1'] })
    const checkbox1 = screen.getByRole('checkbox', {
      name: /Year 1A/,
    }) as HTMLInputElement
    const checkbox2 = screen.getByRole('checkbox', {
      name: /Year 2B/,
    }) as HTMLInputElement
    expect(checkbox1.checked).toBe(true)
    expect(checkbox2.checked).toBe(false)
  })

  it('hides the classes of a student who has left', () => {
    renderEdit({ ...baseStudent, active: false }, { classes })
    expect(screen.queryByText('Classes')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /Year 1A/ })).toBeNull()
    expect(screen.getByText('Consents')).toBeTruthy()
  })

  it('renders consent checkboxes pre-checked from the student record', () => {
    renderEdit({
      ...baseStudent,
      privacy_notice_read: true,
      first_aid_consent: true,
    })

    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Read the Privacy Notice',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Photos & video',
        }) as HTMLInputElement
      ).checked,
    ).toBe(false)
  })

  it('warns that unticking photo consent records a withdrawal', () => {
    renderEdit({ ...baseStudent, photo_video_consent: true })

    expect(
      screen.getByRole('checkbox', { name: 'Photos & video' }),
    ).toHaveAccessibleDescription(
      'Unticking records you as withdrawing consent, with the time.',
    )
  })

  it('sends when the student was last updated, so a stale save is refused', () => {
    const { container } = renderEdit()

    const data = new FormData(container.querySelector('form')!)
    expect(data.get('updated_at')).toBe('2026-10-01 09:30:00.123456+00')
  })

  describe('may leave on their own', () => {
    const LABEL = 'May leave on their own at the end of the session'
    const HINT = 'Only for children aged 12 or over.'

    // 4 Oct 2026: a child born on 4 Oct 2014 turns 12 that day.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-04T09:30:00Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    function box(): HTMLInputElement {
      return screen.getByRole('checkbox', { name: LABEL })
    }

    it.each([
      ['with no date of birth', null],
      ['under 12', '2014-10-05'],
    ])('is disabled with the age hint for a student %s', (_case, dob) => {
      renderEdit({ ...baseStudent, date_of_birth: dob })

      expect(box()).toBeDisabled()
      expect(box()).not.toBeChecked()
      expect(box()).toHaveAccessibleDescription(HINT)
    })

    it('is enabled and shows the answer on record for a student aged 12 or over', () => {
      renderEdit({
        ...baseStudent,
        date_of_birth: '2014-10-04',
        may_leave_unaccompanied: true,
      })

      expect(box()).toBeEnabled()
      expect(box()).toBeChecked()
      expect(screen.queryByText(HINT)).toBeNull()
    })

    it('follows a date of birth changed on the form', () => {
      const { container } = renderEdit({
        ...baseStudent,
        date_of_birth: '2010-01-01',
        may_leave_unaccompanied: true,
      })

      fireEvent.change(screen.getByLabelText('Date of birth'), {
        target: { value: '2020-01-01' },
      })

      expect(box()).toBeDisabled()
      expect(box()).not.toBeChecked()
      const data = new FormData(container.querySelector('form')!)
      expect(data.has('may_leave_unaccompanied')).toBe(false)

      fireEvent.change(screen.getByLabelText('Date of birth'), {
        target: { value: '2010-01-01' },
      })

      expect(box()).toBeEnabled()
      expect(box()).not.toBeChecked()
    })
  })

  it('edits the SEN details', () => {
    renderEdit({ ...baseStudent, sen_details: 'Dyslexia' })

    expect(
      screen.getByLabelText('Special educational needs or disability'),
    ).toHaveValue('Dyslexia')
  })
})
