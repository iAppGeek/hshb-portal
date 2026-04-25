import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

const SECRET_VARS = [
  'AUTH_SECRET',
  'AZURE_AD_CLIENT_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VAPID_PRIVATE_KEY',
]

const SERVER_ONLY_IMPORTS = ["from '@/db'", "from '@/auth'"]

function stripTypeImports(content: string): string {
  return content
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('import type'))
    .join('\n')
}

function walkSrc(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue
    const full = join(dir, entry.name)
    if (statSync(full).isDirectory()) {
      files.push(...walkSrc(full))
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

const srcDir = join(process.cwd(), 'src')
const allFiles = walkSrc(srcDir)
const clientFiles = allFiles.filter((f) =>
  readFileSync(f, 'utf-8').trimStart().startsWith("'use client'"),
)

describe('Secret environment variables', () => {
  it('are not prefixed with NEXT_PUBLIC_', () => {
    for (const varName of SECRET_VARS) {
      expect(
        varName,
        `${varName} must not start with NEXT_PUBLIC_`,
      ).not.toMatch(/^NEXT_PUBLIC_/)
    }
  })

  it('.env.local.example does not use NEXT_PUBLIC_ for secrets', () => {
    const example = readFileSync(
      join(process.cwd(), '.env.local.example'),
      'utf-8',
    )
    for (const varName of SECRET_VARS) {
      expect(
        example,
        `${varName} must not appear as NEXT_PUBLIC_${varName} in .env.local.example`,
      ).not.toContain(`NEXT_PUBLIC_${varName}`)
    }
  })
})

describe('Client components', () => {
  it('do not import server-only modules (@/db, @/auth)', () => {
    for (const file of clientFiles) {
      const content = stripTypeImports(readFileSync(file, 'utf-8'))
      for (const imp of SERVER_ONLY_IMPORTS) {
        expect(
          content,
          `${file} is a client component but imports ${imp}`,
        ).not.toContain(imp)
      }
    }
  })

  it('do not reference secret environment variable names', () => {
    for (const file of clientFiles) {
      const content = stripTypeImports(readFileSync(file, 'utf-8'))
      for (const varName of SECRET_VARS) {
        expect(
          content,
          `${file} is a client component but references ${varName}`,
        ).not.toContain(varName)
      }
    }
  })
})

describe('Supabase client', () => {
  it('uses service role key, not anon key', () => {
    const client = readFileSync(join(srcDir, 'db/client.ts'), 'utf-8')
    expect(client).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(client).not.toContain('SUPABASE_ANON_KEY')
  })

  it('is not imported by any client component', () => {
    for (const file of clientFiles) {
      const content = stripTypeImports(readFileSync(file, 'utf-8'))
      expect(
        content,
        `${file} is a client component but imports from @/db`,
      ).not.toContain("from '@/db'")
    }
  })
})
