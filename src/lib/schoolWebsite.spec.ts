import { describe, it, expect } from 'vitest'

import {
  HOME_SCHOOL_AGREEMENT_URL,
  POLICIES_URL,
  PRIVACY_NOTICE_URL,
} from './schoolWebsite'

describe('school website URLs', () => {
  it('links to the privacy notice on the school website', () => {
    expect(PRIVACY_NOTICE_URL).toBe(
      'https://www.hshb.org.uk/policies/privacy-policy',
    )
  })

  it('links to the policies index on the school website', () => {
    expect(POLICIES_URL).toBe('https://www.hshb.org.uk/policies')
  })

  it('links the home–school agreement to the policies index until it has its own page', () => {
    expect(HOME_SCHOOL_AGREEMENT_URL).toBe(POLICIES_URL)
  })
})
