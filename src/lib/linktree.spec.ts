import { describe, it, expect } from 'vitest'

import { linktreeUrlFor } from './linktree'

describe('linktreeUrlFor', () => {
  it('personalises the link with the local part of a school email', () => {
    expect(linktreeUrlFor('jsmith@hshb.org.uk')).toBe(
      'https://www.hshb.org.uk/linktree?t=jsmith',
    )
  })

  it('normalises case and whitespace', () => {
    expect(linktreeUrlFor('  J.Smith@HSHB.org.uk ')).toBe(
      'https://www.hshb.org.uk/linktree?t=j.smith',
    )
  })

  it('falls back to the plain page for a non-school email', () => {
    expect(linktreeUrlFor('jsmith@gmail.com')).toBe(
      'https://www.hshb.org.uk/linktree',
    )
  })

  it('does not match a look-alike domain', () => {
    expect(linktreeUrlFor('jsmith@nothshb.org.uk')).toBe(
      'https://www.hshb.org.uk/linktree',
    )
  })

  it('falls back to the plain page for an empty email', () => {
    expect(linktreeUrlFor('')).toBe('https://www.hshb.org.uk/linktree')
    expect(linktreeUrlFor('@hshb.org.uk')).toBe(
      'https://www.hshb.org.uk/linktree',
    )
  })
})
