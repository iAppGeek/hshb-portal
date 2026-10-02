import { describe, it, expect } from 'vitest'

import {
  compareClassNames,
  compareClasses,
  compareYearGroups,
  isClassOpen,
  sortClasses,
} from './classes'

const currentYear = { id: 'y2' }

describe('isClassOpen', () => {
  it('is true for an active class in the current year', () => {
    expect(
      isClassOpen({ active: true, academic_year_id: 'y2' }, currentYear),
    ).toBe(true)
  })

  it('is false for an inactive current-year class', () => {
    expect(
      isClassOpen({ active: false, academic_year_id: 'y2' }, currentYear),
    ).toBe(false)
  })

  it('is false for an active class from a past year awaiting migration', () => {
    expect(
      isClassOpen({ active: true, academic_year_id: 'y1' }, currentYear),
    ).toBe(false)
  })

  it('is false for an active class in a future year', () => {
    expect(
      isClassOpen({ active: true, academic_year_id: 'y3' }, currentYear),
    ).toBe(false)
  })
})

describe('compareClasses', () => {
  const schoolOrder = [
    'Nursery',
    'Reception',
    'Year 1',
    'Year 2',
    'Year 3',
    'Year 4',
    'Year 5',
    'Year 6',
    'GCSE I',
    'GCSE II',
    'GCSE III',
    'A Level',
    'Test Class',
  ]

  it('orders class names youngest to oldest', () => {
    const scrambled = [
      'Year 6',
      'A Level',
      'Reception',
      'GCSE III',
      'Year 1',
      'Test Class',
      'Year 4',
      'GCSE I',
      'Nursery',
      'Year 3',
      'GCSE II',
      'Year 5',
      'Year 2',
    ]
    const classes = scrambled.map((name) => ({ name }))
    expect(sortClasses(classes).map((c) => c.name)).toEqual(schoolOrder)
  })

  it('reads numbered GCSE classes the same as roman ones', () => {
    const names = ['GCSE 3', 'A-Level', 'GCSE1', 'gcse 2']
    expect(
      sortClasses(names.map((name) => ({ name }))).map((c) => c.name),
    ).toEqual(['GCSE1', 'gcse 2', 'GCSE 3', 'A-Level'])
  })

  it('puts Year 10 after Year 9, not after Year 1', () => {
    const names = ['Year 10', 'Year 9', 'Year 1']
    expect(
      sortClasses(names.map((name) => ({ name }))).map((c) => c.name),
    ).toEqual(['Year 1', 'Year 9', 'Year 10'])
  })

  it('falls back to the year group when the name is not a stage', () => {
    const classes = [
      { name: 'Gamma', year_group: 'Year 3' },
      { name: 'Alpha', year_group: 'GCSE' },
      { name: 'Beta', year_group: 'pre-school' },
    ]
    expect(sortClasses(classes).map((c) => c.name)).toEqual([
      'Beta',
      'Gamma',
      'Alpha',
    ])
  })

  it('puts unrecognised classes after A Level and before Test, by name', () => {
    const names = ['Test Class', 'Zebra', 'A Level', 'Arabic', 'Nursery']
    expect(
      sortClasses(names.map((name) => ({ name }))).map((c) => c.name),
    ).toEqual(['Nursery', 'A Level', 'Arabic', 'Zebra', 'Test Class'])
  })

  it('breaks a tie on name by year group', () => {
    expect(
      compareClasses(
        { name: 'Year 1', year_group: '2' },
        { name: 'Year 1', year_group: '1' },
      ),
    ).toBeGreaterThan(0)
  })

  it('does not change the array it is given', () => {
    const classes = [{ name: 'Year 2' }, { name: 'Year 1' }]
    sortClasses(classes)
    expect(classes.map((c) => c.name)).toEqual(['Year 2', 'Year 1'])
  })
})

describe('compareClassNames', () => {
  it('orders names by school stage', () => {
    expect(compareClassNames('Reception', 'Nursery')).toBeGreaterThan(0)
    expect(compareClassNames('Year 6', 'GCSE I')).toBeLessThan(0)
  })

  it('puts no class last', () => {
    const names = [null, 'Year 2', null, 'Nursery']
    expect([...names].sort(compareClassNames)).toEqual([
      'Nursery',
      'Year 2',
      null,
      null,
    ])
  })
})

describe('compareYearGroups', () => {
  it('orders the year group labels classes use', () => {
    const groups = ['Test', 'A Level', 'GCSE', '6', '1', 'All', 'pre-school']
    expect([...groups].sort(compareYearGroups)).toEqual([
      'pre-school',
      '1',
      '6',
      'GCSE',
      'A Level',
      'All',
      'Test',
    ])
  })
})
