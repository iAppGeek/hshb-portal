import { describe, it, expect } from 'vitest'

import { PRIVACY_NOTICE_URL } from './schoolWebsite'

describe('school website URLs', () => {
  it('links to the privacy notice on the school website', () => {
    expect(PRIVACY_NOTICE_URL).toBe(
      'https://www.hshb.org.uk/policies/privacy-policy',
    )
  })
})
