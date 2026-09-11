import { test, expect } from '../../fixtures/index'
import { db, SEED_IDS } from '../../fixtures/seed'

// Pin to admin — admins can view every class register
test.use({ storageState: 'e2e/.auth/admin.json' })

const SEED_GUARDIAN_ID = '20000000-0000-0000-0000-000000000001'
const TEACHER_EMAIL = 'teacher@test.hshb.local'
const TEACHER_PHONE = '07700000002'

test.describe('Class register', () => {
  let classId: string | undefined
  let studentId: string | undefined
  let studentCode: string

  test.beforeEach(async ({}, testInfo) => {
    // Unique per test and project: tests in this file run in parallel, and
    // student_code is unique
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    studentCode = `E2E-${suffix}`

    // Inactive so it never appears in the seed teachers' own class lists
    const { data: cls, error: classError } = await db
      .from('classes')
      .insert({
        name: `E2ERegisterClass${suffix}`,
        year_group: '1',
        teacher_id: SEED_IDS.staff.teacher,
        active: false,
      })
      .select('id')
      .single()
    if (classError) throw classError
    classId = cls.id

    const { data: student, error: studentError } = await db
      .from('students')
      .insert({
        first_name: 'Register',
        last_name: `E2E${suffix}`,
        student_code: studentCode,
        primary_guardian_id: SEED_GUARDIAN_ID,
        // students_address_source_check needs an address or an address guardian
        address_guardian_id: SEED_GUARDIAN_ID,
      })
      .select('id')
      .single()
    if (studentError) throw studentError
    studentId = student.id

    const { error: enrolError } = await db
      .from('student_classes')
      .insert({ class_id: classId, student_id: studentId })
    if (enrolError) throw enrolError
  })

  test.afterEach(async () => {
    if (studentId) {
      await db.from('student_classes').delete().eq('student_id', studentId)
      await db.from('students').delete().eq('id', studentId)
    }
    if (classId) {
      await db.from('classes').delete().eq('id', classId)
    }
    studentId = undefined
    classId = undefined
  })

  test("shows the teacher's work email instead of their phone", async ({
    page,
  }) => {
    await page.goto(`/classes/${classId}`)

    await expect(
      page.getByRole('link', { name: TEACHER_EMAIL }),
    ).toHaveAttribute('href', `mailto:${TEACHER_EMAIL}`)
    await expect(page.getByText(TEACHER_PHONE)).toHaveCount(0)
  })

  test('shows Student ID and Primary Contact columns', async ({
    page,
    isMobile,
  }) => {
    await page.goto(`/classes/${classId}`)

    await expect(
      page.getByRole('columnheader', { name: 'Primary Contact' }),
    ).toBeVisible()
    await expect(
      page.getByRole('columnheader', { name: 'Guardian', exact: true }),
    ).toHaveCount(0)

    // Student ID is hidden on narrow screens to keep the register readable
    test.skip(isMobile, 'Student ID column is hidden on mobile')
    await expect(
      page.getByRole('columnheader', { name: 'Student ID' }),
    ).toBeVisible()
    await expect(page.getByRole('cell', { name: studentCode })).toBeVisible()
  })
})
