import { describe, it, expect } from 'vitest'

import { collectionAdultFieldName, collectionAdultIndexes } from './fieldNames'

describe('collectionAdultFieldName', () => {
  it('names a field by its row position', () => {
    expect(collectionAdultFieldName(0, 'name')).toBe('collection_adult_0_name')
    expect(collectionAdultFieldName(12, 'phone')).toBe(
      'collection_adult_12_phone',
    )
  })
})

describe('collectionAdultIndexes', () => {
  it('returns the rows present, in numeric order', () => {
    const fd = new FormData()
    fd.set('collection_adult_10_name', 'C')
    fd.set('collection_adult_2_name', 'B')
    fd.set('collection_adult_0_name', 'A')
    fd.set('collection_adult_0_phone', '07700 900000')

    expect(collectionAdultIndexes(fd)).toEqual([0, 2, 10])
  })

  it('ignores other fields and rows without a name field', () => {
    const fd = new FormData()
    fd.set('collection_adult_3_phone', '07700 900000')
    fd.set('primary_collection_allowed', 'on')
    fd.set('collection_adult_x_name', 'A')

    expect(collectionAdultIndexes(fd)).toEqual([])
  })
})
