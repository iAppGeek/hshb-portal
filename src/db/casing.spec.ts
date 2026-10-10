import { getTableColumns, is } from 'drizzle-orm'
import { CasingCache } from 'drizzle-orm/casing'
import { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { camelKey, snakeKey, toCamel, toSnake } from './casing'
import * as schema from './schema'

const tables: PgTable[] = []
for (const value of Object.values(schema) as unknown[]) {
  if (is(value, PgTable)) tables.push(value)
}

describe('snakeKey / camelKey', () => {
  it('round-trips every column in the schema to its database name', () => {
    const casing = new CasingCache('snake_case')
    const mismatches: string[] = []
    for (const table of tables) {
      for (const [key, column] of Object.entries(getTableColumns(table))) {
        const dbName = casing.getColumnCasing(column)
        if (snakeKey(key) !== dbName || camelKey(dbName) !== key) {
          mismatches.push(`${key} ↔ ${dbName}`)
        }
      }
    }
    expect(tables).toHaveLength(21)
    expect(mismatches).toEqual([])
  })

  it('maps relation names to the aliases the app reads', () => {
    expect(snakeKey('primaryGuardian')).toBe('primary_guardian')
    expect(snakeKey('additionalContact1')).toBe('additional_contact_1')
    expect(snakeKey('studentClasses')).toBe('student_classes')
  })
})

describe('toSnake', () => {
  it('renames keys at every depth and leaves values alone', () => {
    const row = {
      firstName: 'Ann',
      addressLine1: null,
      studentClasses: [{ class: { yearGroup: 'Y1' } }],
      createdAt: '2026-09-27T12:00:00+00:00',
    }
    const snake = toSnake(row)
    expect(snake).toEqual({
      first_name: 'Ann',
      address_line_1: null,
      student_classes: [{ class: { year_group: 'Y1' } }],
      created_at: '2026-09-27T12:00:00+00:00',
    })
    expectTypeOf(snake).toEqualTypeOf<{
      first_name: string
      address_line_1: null
      student_classes: { class: { year_group: string } }[]
      created_at: string
    }>()
  })

  it('keeps null and undefined as they are', () => {
    expect(toSnake(null)).toBeNull()
    expect(toSnake(undefined)).toBeUndefined()
  })
})

describe('toCamel', () => {
  it('renames top-level keys and keeps optional fields optional', () => {
    const input: { first_name: string; address_line_1?: string | null } = {
      first_name: 'Ann',
    }
    const camel = toCamel(input)
    expect(camel).toEqual({ firstName: 'Ann' })
    expectTypeOf(camel).toEqualTypeOf<{
      firstName: string
      addressLine1?: string | null
    }>()
  })
})
