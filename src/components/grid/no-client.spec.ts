import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

const FORBIDDEN_HOOKS = ['useState', 'useEffect', 'useTransition', 'useMemo']
const HANDLER_PROP_RE = /\bon[A-Z]\w*=/

function walkDir(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue
    const full = join(dir, entry.name)
    if (statSync(full).isDirectory()) {
      files.push(...walkDir(full))
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.spec.tsx')
    ) {
      files.push(full)
    }
  }
  return files
}

const gridDirs = [
  join(process.cwd(), 'src', 'components', 'grid'),
  join(process.cwd(), 'src', 'lib', 'grid'),
]
const gridFiles = gridDirs.flatMap(walkDir)

describe('Shared grid code stays server-safe', () => {
  it('found grid files to check (sanity check the walk itself works)', () => {
    expect(gridFiles.length).toBeGreaterThan(0)
  })

  it("never declares 'use client'", () => {
    for (const file of gridFiles) {
      const content = readFileSync(file, 'utf-8')
      expect(
        content.trimStart().startsWith("'use client'"),
        `${file} must not be a client component`,
      ).toBe(false)
    }
  })

  it('never uses React hooks that require client rendering', () => {
    for (const file of gridFiles) {
      const content = readFileSync(file, 'utf-8')
      for (const hook of FORBIDDEN_HOOKS) {
        expect(
          content,
          `${file} must not use ${hook} (server components can't use hooks)`,
        ).not.toContain(`${hook}(`)
      }
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
