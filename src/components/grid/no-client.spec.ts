import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

import { walkSourceFiles } from '@/test/walkSourceFiles'

const USE_CLIENT_RE = /^['"]use client['"]/
const HOOK_CALL_RE = /\buse[A-Z]\w*\s*[<(]/
const HANDLER_PROP_RE = /\bon[A-Z]\w*=/

const gridDirs = [
  join(process.cwd(), 'src', 'components', 'grid'),
  join(process.cwd(), 'src', 'lib', 'grid'),
]
const gridFiles = gridDirs.flatMap(walkSourceFiles)

describe('Shared grid code stays server-safe', () => {
  it('found grid files to check (sanity check the walk itself works)', () => {
    expect(gridFiles.length).toBeGreaterThan(0)
  })

  it("never declares 'use client'", () => {
    for (const file of gridFiles) {
      const content = readFileSync(file, 'utf-8')
      expect(
        USE_CLIENT_RE.test(content.trimStart()),
        `${file} must not be a client component`,
      ).toBe(false)
    }
  })

  it("never calls a React hook (server components can't use hooks)", () => {
    for (const file of gridFiles) {
      const content = readFileSync(file, 'utf-8')
      const match = content.match(HOOK_CALL_RE)
      expect(
        match,
        `${file} must not call a hook${match ? ` (found "${match[0]}")` : ''}`,
      ).toBeNull()
    }
  })

  it('never wires up a JSX event handler prop (onClick, onChange, …)', () => {
    for (const file of gridFiles) {
      const content = readFileSync(file, 'utf-8')
      const match = content.match(HANDLER_PROP_RE)
      expect(
        match,
        `${file} must not wire up a JSX event handler prop${match ? ` (found "${match[0]}")` : ''}`,
      ).toBeNull()
    }
  })
})
