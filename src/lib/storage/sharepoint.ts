import 'server-only'

import type { FileStorageProvider } from './types'

/**
 * Microsoft Graph (SharePoint/OneDrive) implementation of {@link FileStorageProvider}.
 *
 * Identity uses the **client-credentials flow** (a SYSTEM app token, not the
 * user's 365 token) scoped to a single governed SharePoint document library via
 * `Sites.Selected` — never `Files.ReadWrite.All`. Files therefore survive any
 * staff member leaving and stay in one auditable location.
 *
 * Implemented over `global.fetch` (no SDK dependency) so specs can mock the
 * transport and no live Graph connection is needed to build or verify.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0'
// Graph requires the simple PUT path for files ≤ 4 MiB; larger files use an
// upload session with chunked PUTs (chunks must be a multiple of 320 KiB).
const SIMPLE_UPLOAD_MAX = 4 * 1024 * 1024
const CHUNK_SIZE = 10 * 320 * 1024 // 3,276,800 bytes — a 320 KiB multiple
const TOKEN_SKEW_MS = 60_000

type CachedToken = { token: string; expiresAt: number }
let cachedToken: CachedToken | null = null

/** Test-only reset for the module-level token cache. */
export function __resetTokenCacheForTests(): void {
  cachedToken = null
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`SharePoint storage: missing env var ${name}`)
  return value
}

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.token

  const tenant = requireEnv('GRAPH_TENANT_ID')
  const body = new URLSearchParams({
    client_id: requireEnv('GRAPH_CLIENT_ID'),
    client_secret: requireEnv('GRAPH_CLIENT_SECRET'),
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })

  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  )
  if (!res.ok) {
    throw new Error(`SharePoint storage: token request failed (${res.status})`)
  }
  const json = (await res.json()) as {
    access_token: string
    expires_in: number
  }
  cachedToken = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000 - TOKEN_SKEW_MS,
  }
  return cachedToken.token
}

function driveItemPath(key: string): string {
  const drive = requireEnv('SHAREPOINT_DRIVE_ID')
  // key is server-generated (owner path + uuid + ext); encode each segment so
  // the path-addressed Graph URL stays safe, keeping the slashes as separators.
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `${GRAPH}/drives/${drive}/root:/${encoded}`
}

async function authHeaders(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getAccessToken()}` }
}

async function simpleUpload(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const res = await fetch(`${driveItemPath(key)}:/content`, {
    method: 'PUT',
    headers: { ...(await authHeaders()), 'Content-Type': contentType },
    body: body as BodyInit,
  })
  if (!res.ok) {
    throw new Error(`SharePoint storage: upload failed (${res.status})`)
  }
}

async function chunkedUpload(key: string, body: Uint8Array): Promise<void> {
  const sessionRes = await fetch(`${driveItemPath(key)}:/createUploadSession`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item: { '@microsoft.graph.conflictBehavior': 'replace' },
    }),
  })
  if (!sessionRes.ok) {
    throw new Error(
      `SharePoint storage: createUploadSession failed (${sessionRes.status})`,
    )
  }
  const { uploadUrl } = (await sessionRes.json()) as { uploadUrl: string }

  const total = body.byteLength
  for (let start = 0; start < total; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, total)
    const chunk = body.subarray(start, end)
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.byteLength),
        'Content-Range': `bytes ${start}-${end - 1}/${total}`,
      },
      body: chunk as BodyInit,
    })
    // 202 = accepted (more chunks expected); 200/201 = complete.
    if (res.status !== 202 && res.status !== 200 && res.status !== 201) {
      throw new Error(`SharePoint storage: chunk upload failed (${res.status})`)
    }
  }
}

export const sharePointStorage: FileStorageProvider = {
  async upload(key, body, contentType) {
    if (body.byteLength <= SIMPLE_UPLOAD_MAX) {
      await simpleUpload(key, body, contentType)
    } else {
      await chunkedUpload(key, body)
    }
  },

  async getDownloadUrl(key) {
    const res = await fetch(
      `${driveItemPath(key)}?select=@microsoft.graph.downloadUrl`,
      { headers: await authHeaders() },
    )
    if (!res.ok) {
      throw new Error(
        `SharePoint storage: download URL request failed (${res.status})`,
      )
    }
    const json = (await res.json()) as {
      '@microsoft.graph.downloadUrl'?: string
    }
    const url = json['@microsoft.graph.downloadUrl']
    if (!url) {
      throw new Error('SharePoint storage: no download URL returned')
    }
    return url
  },

  async delete(key) {
    const res = await fetch(driveItemPath(key), {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    // 204 = deleted, 404 = already gone (idempotent).
    if (!res.ok && res.status !== 404) {
      throw new Error(`SharePoint storage: delete failed (${res.status})`)
    }
  },
}
