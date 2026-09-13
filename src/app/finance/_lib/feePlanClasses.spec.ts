import { describe, it, expect } from 'vitest'

import type { FeePlanWithClasses } from '@/db'

import {
  planLabel,
  takenClassLabels,
  toClassOptions,
  validateFeePlan,
} from './feePlanClasses'

function makePlan(overrides: Partial<FeePlanWithClasses>): FeePlanWithClasses {
  return {
    id: 'plan-a',
    name: 'Standard',
    academic_year: '2025-26',
    full_year_amount: 800,
    monthly_instalment_amount: 100,
    termly_instalment_amount: 266.67,
    notes: null,
    active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    class_ids: [],
    ...overrides,
  }
}

const classes = [
  { id: 'c2', name: 'Beta', year_group: '2', academic_year: '2025/26' },
  { id: 'c1', name: 'Alpha', year_group: '1', academic_year: '2025-26' },
  { id: 'c3', name: 'Gamma', year_group: '3', academic_year: '2024-25' },
]

describe('toClassOptions', () => {
  it('keeps only the form fields and sorts by name', () => {
    const withExtras = classes.map((c) => ({ ...c, teacher_id: 't' }))
    expect(toClassOptions(withExtras).map((c) => c.name)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ])
    expect(toClassOptions(withExtras)[0]).not.toHaveProperty('teacher_id')
  })
})

describe('planLabel', () => {
  it('combines name and year', () => {
    expect(planLabel({ name: 'Standard', academic_year: '2025-26' })).toBe(
      'Standard (2025-26)',
    )
  })
})

describe('takenClassLabels', () => {
  it('maps classes owned by other plans to their label', () => {
    const plans = [
      makePlan({ id: 'p1', class_ids: ['c1'] }),
      makePlan({ id: 'p2', name: 'Sibling', class_ids: ['c2'] }),
    ]
    expect(takenClassLabels(plans, 'p1')).toEqual({
      c2: 'Sibling (2025-26)',
    })
    expect(takenClassLabels(plans, null)).toEqual({
      c1: 'Standard (2025-26)',
      c2: 'Sibling (2025-26)',
    })
  })
})

describe('validateFeePlan', () => {
  const input = { name: 'New', academic_year: '2025-26', class_ids: ['c1'] }

  it('passes a valid plan, accepting either academic year format', () => {
    expect(
      validateFeePlan({ ...input, class_ids: ['c1', 'c2'] }, classes, [], null),
    ).toBeNull()
  })

  it('rejects a duplicate name in the same year, ignoring case', () => {
    expect(
      validateFeePlan(
        { ...input, name: 'standard' },
        classes,
        [makePlan({})],
        null,
      ),
    ).toBe('A fee plan called Standard already exists for 2025-26.')
  })

  it('allows the same name when editing that plan', () => {
    expect(
      validateFeePlan(
        { ...input, name: 'Standard' },
        classes,
        [makePlan({ class_ids: ['c1'] })],
        'plan-a',
      ),
    ).toBeNull()
  })

  it('rejects a class that no longer exists', () => {
    expect(
      validateFeePlan({ ...input, class_ids: ['gone'] }, classes, [], null),
    ).toBe('One of the selected classes no longer exists.')
  })

  it('rejects a class from another academic year', () => {
    expect(
      validateFeePlan({ ...input, class_ids: ['c3'] }, classes, [], null),
    ).toBe('Gamma is not a 2025-26 class.')
  })

  it('rejects a class already on another plan', () => {
    expect(
      validateFeePlan(
        input,
        classes,
        [makePlan({ id: 'other', name: 'Other', class_ids: ['c1'] })],
        null,
      ),
    ).toBe('Alpha is already on the Other (2025-26) fee plan.')
  })
})
