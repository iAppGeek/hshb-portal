import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('./sharepoint', () => ({ sharePointStorage: { __id: 'sharepoint' } }))

import { getFileStorage } from './index'

describe('getFileStorage', () => {
  const original = process.env.FILE_STORAGE_PROVIDER

  afterEach(() => {
    process.env.FILE_STORAGE_PROVIDER = original
  })

  it('returns the SharePoint adapter when configured', () => {
    process.env.FILE_STORAGE_PROVIDER = 'sharepoint'
    expect(getFileStorage()).toEqual({ __id: 'sharepoint' })
  })

  it('throws when the provider is unset', () => {
    delete process.env.FILE_STORAGE_PROVIDER
    expect(() => getFileStorage()).toThrow(/not configured/)
  })

  it('throws on an unknown provider', () => {
    process.env.FILE_STORAGE_PROVIDER = 'r2'
    expect(() => getFileStorage()).toThrow(/not configured/)
  })
})
