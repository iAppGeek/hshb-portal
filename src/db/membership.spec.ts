import { describe, it, expect, vi, type Mock } from 'vitest'

import { currentStays, withCurrentClasses } from './membership'

// Like a PostgREST builder, `is` returns the same query so calls can chain.
type MockQuery = { is: Mock<(column: string, value: null) => MockQuery> }

function mockQuery(): MockQuery {
  const query: MockQuery = {
    is: vi.fn<(column: string, value: null) => MockQuery>(),
  }
  query.is.mockReturnValue(query)
  return query
}

describe('currentStays', () => {
  it('filters student_classes rows to those with no end date', () => {
    const query = mockQuery()
    expect(currentStays(query)).toBe(query)
    expect(query.is).toHaveBeenCalledWith('end_date', null)
  })
})

describe('withCurrentClasses', () => {
  it('filters the student_classes embed by default', () => {
    const query = mockQuery()
    expect(withCurrentClasses(query)).toBe(query)
    expect(query.is).toHaveBeenCalledWith('student_classes.end_date', null)
  })

  it('filters a named embed', () => {
    const query = mockQuery()
    withCurrentClasses(query, 'members')
    expect(query.is).toHaveBeenCalledWith('members.end_date', null)
  })
})
