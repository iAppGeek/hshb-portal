import { test, expect } from '../../fixtures/index'
import { loadWithFreshData } from '../../fixtures/loadWithFreshData'
import { db, SEED_IDS } from '../../fixtures/seed'

// Pin to admin — admins can view every class register
test.use({ storageState: 'e2e/.auth/admin.json' })

test.describe('All class registers', () => {
  let classId: string | undefined
  let studentId: string | undefined
  let className: string

  test.beforeEach(async ({}, testInfo) => {
    const suffix = testInfo.testId.replace(/[^a-z0-9]/gi, '')
    className = `E2EAllRegisters${suffix}`

    const { data: cls, error: classError } = await db
      .from('classes')
      .insert({
        name: className,
        year_group: '1',
        teacher_id: SEED_IDS.staff.teacher,
        academic_year_id: SEED_IDS.academicYears.current,
        active: true,
      })
      .select('id')
      .single()
    if (classError) throw classError
    classId = cls.id

    const { data: student, error: studentError } = await db
      .from('students')
      .insert({
        first_name: 'AllRegisters',
        last_name: `E2E${suffix}`,
        student_code: `E2E-AR-${suffix}`,
        primary_guardian_id: '20000000-0000-0000-0000-000000000001',
        address_guardian_id: '20000000-0000-0000-0000-000000000001',
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

  test('links from the classes list to the print-all page', async ({
    page,
  }) => {
    await page.goto('/classes')
    await page.getByRole('link', { name: 'Print All Registers' }).click()
    await expect(page).toHaveURL(/\/classes\/print/)
  })

  test('lists a register section for the seeded class', async ({
    page,
    isMobile,
  }) => {
    await loadWithFreshData(page, isMobile, '/classes/print', async () => {
      await expect(
        page.getByRole('heading', { name: `${className} — Class Register` }),
      ).toBeVisible()
    })
    await expect(
      page.getByRole('button', { name: 'Print All Registers' }),
    ).toBeVisible()
  })
})
