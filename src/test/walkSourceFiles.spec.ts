import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { walkSourceFiles } from './walkSourceFiles'

describe('walkSourceFiles', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'walk-source-files-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('finds .ts and .tsx files recursively', () => {
    mkdirSync(join(dir, 'nested'), { recursive: true })
    writeFileSync(join(dir, 'a.ts'), '')
    writeFileSync(join(dir, 'nested', 'b.tsx'), '')

    const files = walkSourceFiles(dir)
    expect(files).toContain(join(dir, 'a.ts'))
    expect(files).toContain(join(dir, 'nested', 'b.tsx'))
  })

  it('excludes .spec.ts and .spec.tsx files', () => {
    writeFileSync(join(dir, 'a.spec.ts'), '')
    writeFileSync(join(dir, 'b.spec.tsx'), '')
    writeFileSync(join(dir, 'c.ts'), '')

    const files = walkSourceFiles(dir)
    expect(files).toEqual([join(dir, 'c.ts')])
  })

  it('skips node_modules, .next and .git directories', () => {
    mkdirSync(join(dir, 'node_modules'), { recursive: true })
    mkdirSync(join(dir, '.next'), { recursive: true })
    mkdirSync(join(dir, '.git'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'a.ts'), '')
    writeFileSync(join(dir, '.next', 'b.ts'), '')
    writeFileSync(join(dir, '.git', 'c.ts'), '')

    expect(walkSourceFiles(dir)).toEqual([])
  })

  it('ignores non-ts/tsx files', () => {
    writeFileSync(join(dir, 'readme.md'), '')
    expect(walkSourceFiles(dir)).toEqual([])
  })
})
