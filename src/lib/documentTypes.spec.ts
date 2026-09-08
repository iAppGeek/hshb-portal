import { describe, it, expect } from 'vitest'

import {
  DOCUMENT_TYPES,
  getDocumentType,
  isDocumentTypeOfMode,
} from './documentTypes'

describe('DOCUMENT_TYPES catalog', () => {
  it('has unique values', () => {
    const values = DOCUMENT_TYPES.map((t) => t.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('every entry has a valid mode', () => {
    for (const t of DOCUMENT_TYPES) {
      expect(['file', 'record']).toContain(t.mode)
    }
  })

  it('record-mode entries may expose predefined fields', () => {
    const dbs = getDocumentType('dbs_check')
    expect(dbs?.mode).toBe('record')
    expect(dbs?.fields?.length).toBeGreaterThan(0)
  })

  it('file-mode entries do not declare fields', () => {
    for (const t of DOCUMENT_TYPES.filter((t) => t.mode === 'file')) {
      expect(t.fields).toBeUndefined()
    }
  })
})

describe('getDocumentType', () => {
  it('resolves a known value', () => {
    expect(getDocumentType('identification')?.label).toBe('Identification')
  })

  it('returns undefined for an unknown value', () => {
    expect(getDocumentType('not-a-type')).toBeUndefined()
  })
})

describe('isDocumentTypeOfMode', () => {
  it('matches the catalog mode', () => {
    expect(isDocumentTypeOfMode('contract', 'file')).toBe(true)
    expect(isDocumentTypeOfMode('contract', 'record')).toBe(false)
    expect(isDocumentTypeOfMode('dbs_check', 'record')).toBe(true)
    expect(isDocumentTypeOfMode('unknown', 'file')).toBe(false)
  })
})
