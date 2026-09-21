import { test, expect } from '../../fixtures/index'
import {
  db,
  SEED_IDS,
  deleteClassByName,
  deleteStaffByEmail,
} from '../../fixtures/seed'

// Pin to admin — only admins can edit classes
test.use({ storageState: 'e2e/.auth/admin.json' })

test.describe('Edit class', () => {
  let className: string
  let classId: string
  let teacherEmails: string[]
  let originalTeacherId: string
  let newTeacherId: string

  // The seed staff ids are not RFC 4122 UUIDs, so the class form rejects them
  // on save. Fixture teachers get real UUIDs from the database, and owning the
  // class keeps it out of the seed teachers' own class lists.
  async function createTeacher(
    lastName: string,
    email: string,
  ): Promise<string> {
    const { data, error } = await db
      .from('staff')
      .insert({
        first_name: 'E2E',
        last_name: lastName,
        email,
        role: 'teacher',
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }

  test.beforeEach(async ({}, testInfo) => {
    const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, '')
    className = `E2ECacheClass${suffix}`
    teacherEmails = ['a', 'b'].map(
      (n) => `e2e.cacheteacher${n}.${suffix.toLowerCase()}@test.hshb.local`,
    )

    originalTeacherId = await createTeacher(
      `CacheTeacherA${suffix}`,
      teacherEmails[0],
    )
    newTeacherId = await createTeacher(
      `CacheTeacherB${suffix}`,
      teacherEmails[1],
    )

    const { data, error } = await db
      .from('classes')
      .insert({
        name: className,
        year_group: '1',
        teacher_id: originalTeacherId,
        academic_year_id: SEED_IDS.academicYears.current,
      })
      .select('id')
      .single()
    if (error) throw error
    classId = data.id
  })

  test.afterEach(async () => {
    await deleteClassByName(className)
    for (const email of teacherEmails) await deleteStaffByEmail(email)
  })

  test('selects the saved teacher without reloading', async ({ page }) => {
    await page.goto(`/classes/${classId}/edit`)
    const teacher = page.locator('#teacher_id')
    await expect(teacher).toHaveValue(originalTeacherId)

    await teacher.selectOption(newTeacherId)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page).toHaveURL('/classes')

    await page.goto(`/classes/${classId}/edit`)
    await expect(page.locator('#teacher_id')).toHaveValue(newTeacherId)
  })
})
