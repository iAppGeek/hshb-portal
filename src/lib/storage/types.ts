/**
 * Provider-agnostic contract for file byte storage.
 *
 * Document bytes live OUTSIDE Supabase (whose 1 GB free file allowance is the
 * binding cost constraint). All app code talks to this interface; the live
 * backend is selected in {@link ./index} by the `FILE_STORAGE_PROVIDER` env
 * var, so switching providers is a config + adapter change, not a rewrite.
 */
export type FileStorageProvider = {
  /** Store `body` at `key`, overwriting any existing object at that key. */
  upload(key: string, body: Uint8Array, contentType: string): Promise<void>
  /**
   * A short-lived, pre-authenticated URL the browser can be redirected to in
   * order to fetch the object (S3 presigned GET / Graph `@microsoft.graph.downloadUrl`).
   */
  getDownloadUrl(key: string): Promise<string>
  /**
   * Permanently remove the object's bytes.
   *
   * NOTE: this is deliberately NOT called by the soft-delete flow — deleting a
   * document only sets `deleted_at`, the bytes are retained for admin records.
   * It is kept on the interface for a future scheduled hard-purge / GDPR
   * erasure tool. See the retention note in `src/db/documents.ts`.
   */
  delete(key: string): Promise<void>
}
