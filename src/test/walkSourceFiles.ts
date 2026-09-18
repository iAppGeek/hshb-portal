import { readdirSync } from 'fs'
import { join } from 'path'

const SKIPPED_DIRS = ['node_modules', '.next', '.git']

/**
 * Recursively lists every `.ts`/`.tsx` source file under `dir`, skipping
 * spec files and build/VCS directories. Used by specs that audit the
 * codebase for a convention (no client code, no secrets, …).
 */
export function walkSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRS.includes(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(full))
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
