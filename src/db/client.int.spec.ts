import { count, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { db } from './client'
import {
  academicYears,
  classes,
  guardians,
  studentClasses,
  students,
} from './schema'

describe('db client', () => {
  it('runs a query over the direct connection', async () => {
    const [row] = await db.select({ n: count() }).from(students)
    expect(row.n).toBeGreaterThanOrEqual(0)
  })

  it('maps camelCase properties to snake_case columns', async () => {
    const rows = await db
      .select({ id: guardians.id, addressLine1: guardians.addressLine1 })
      .from(guardians)
      .limit(1)
    expect(Array.isArray(rows)).toBe(true)
  })

  it('resolves relations through the relational query API', async () => {
    const student = await db.query.students.findFirst({
      columns: { id: true, primaryGuardianId: true },
      with: {
        primaryGuardian: { columns: { id: true } },
        studentClasses: {
          columns: { id: true },
          with: { class: { columns: { id: true } } },
        },
      },
    })
    if (student) {
      expect(student.primaryGuardian.id).toBe(student.primaryGuardianId)
    }
  })

  it('returns date and timestamptz columns as the text Postgres prints', async () => {
    const [year] = await db
      .select({
        startDate: academicYears.startDate,
        createdAt: academicYears.createdAt,
      })
      .from(academicYears)
      .limit(1)
    expect(year.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof year.createdAt).toBe('string')
  })

  it('runs more parallel queries than the pool has connections', async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        db.select({ n: count() }).from(students),
      ),
    )
    expect(new Set(results.map(([row]) => row.n)).size).toBe(1)
  })

  it('aggregates with the SQL-like builder', async () => {
    const perClass = await db
      .select({ classId: classes.id, n: count(studentClasses.id) })
      .from(classes)
      .leftJoin(studentClasses, eq(studentClasses.classId, classes.id))
      .groupBy(classes.id)
    const [total] = await db.select({ n: count() }).from(studentClasses)
    expect(perClass.reduce((sum, r) => sum + r.n, 0)).toBe(total.n)
  })
})
