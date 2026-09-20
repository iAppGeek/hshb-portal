import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

import { walkSourceFiles } from '@/test/walkSourceFiles'

const SECRET_VARS = [
  'AUTH_SECRET',
  'AZURE_AD_CLIENT_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VAPID_PRIVATE_KEY',
  'TURNSTILE_SECRET_KEY',
]

const SERVER_ONLY_IMPORTS = ["from '@/db'", "from '@/auth'"]

function stripTypeImports(content: string): string {
  return content
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('import type'))
    .join('\n')
}

const srcDir = join(process.cwd(), 'src')
const allFiles = walkSourceFiles(srcDir)
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

describe('Server actions', () => {
  function serverActionFiles(): string[] {
    return allFiles.filter((file) =>
      stripTypeImports(readFileSync(file, 'utf-8'))
        .trimStart()
        .startsWith("'use server'"),
    )
  }

  it('go through runAction', () => {
    for (const file of serverActionFiles()) {
      const content = stripTypeImports(readFileSync(file, 'utf-8'))
      expect(
        content,
        `${file} is a server action and must import runAction from @/lib/action`,
      ).toContain("from '@/lib/action'")
      expect(
        content,
        `${file} is a server action and must call runAction`,
      ).toContain('runAction(')
    }
  })

  it('only opt out of the session check inside the public /register tree', () => {
    for (const file of serverActionFiles()) {
      if (file.includes(join('app', 'register') + '/')) continue
      const content = stripTypeImports(readFileSync(file, 'utf-8'))
      expect(
        content,
        `${file} is outside the public /register tree and must not pass public: true`,
      ).not.toContain('public: true')
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
