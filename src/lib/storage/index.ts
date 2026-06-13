import type { FileStorageProvider } from './types'
import { sharePointStorage } from './sharepoint'

export type { FileStorageProvider } from './types'

/**
 * Resolve the live file-storage backend from `FILE_STORAGE_PROVIDER`.
 *
 * This is the single seam that knows which backend is in use. Today only the
 * SharePoint adapter is built; a future Cloudflare R2 (or other) adapter drops
 * in here behind the same {@link FileStorageProvider} interface with no change
 * to the rest of the app.
 */
export function getFileStorage(): FileStorageProvider {
  const provider = process.env.FILE_STORAGE_PROVIDER
  switch (provider) {
    case 'sharepoint':
      return sharePointStorage
    default:
      throw new Error(
        `File storage not configured: set FILE_STORAGE_PROVIDER (got ${
          provider ? `"${provider}"` : 'unset'
        })`,
      )
  }
}
