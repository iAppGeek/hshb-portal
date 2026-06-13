import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

import { sharePointStorage, __resetTokenCacheForTests } from './sharepoint'

type FetchCall = { url: string; init?: RequestInit }
let calls: FetchCall[]

function jsonOk(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

function route(url: string, init?: RequestInit): Response {
  const method = (init?.method ?? 'GET').toUpperCase()
  if (url.includes('/oauth2/v2.0/token')) {
    return jsonOk({ access_token: 'app-token', expires_in: 3600 })
  }
  if (url.includes('/createUploadSession')) {
    return jsonOk({ uploadUrl: 'https://upload.example/session' })
  }
  if (url === 'https://upload.example/session') {
    return jsonOk({}, 202)
  }
  if (url.includes('@microsoft.graph.downloadUrl')) {
    return jsonOk({ '@microsoft.graph.downloadUrl': 'https://dl.example/file' })
  }
  if (method === 'DELETE') return jsonOk({}, 204)
  // simple content PUT
  return jsonOk({})
}

beforeEach(() => {
  calls = []
  __resetTokenCacheForTests()
  process.env.GRAPH_TENANT_ID = 'tenant-1'
  process.env.GRAPH_CLIENT_ID = 'client-1'
  process.env.GRAPH_CLIENT_SECRET = 'secret-1'
  process.env.SHAREPOINT_DRIVE_ID = 'drive-1'
  vi.spyOn(global, 'fetch').mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      return Promise.resolve(route(url, init))
    },
  )
})

describe('sharePointStorage.upload', () => {
  it('small file → simple PUT to /content', async () => {
    await sharePointStorage.upload(
      'a/b/x.pdf',
      new Uint8Array([1, 2, 3]),
      'application/pdf',
    )
    const put = calls.find((c) => c.url.includes(':/content'))
    expect(put).toBeDefined()
    expect(put?.url).toContain('/drives/drive-1/root:/a/b/x.pdf:/content')
    expect((put?.init?.method ?? '').toUpperCase()).toBe('PUT')
  })

  it('large file → createUploadSession then chunked PUTs', async () => {
    const big = new Uint8Array(5 * 1024 * 1024)
    await sharePointStorage.upload('a/b/big.pdf', big, 'application/pdf')
    expect(calls.some((c) => c.url.includes('/createUploadSession'))).toBe(true)
    const chunkPuts = calls.filter(
      (c) => c.url === 'https://upload.example/session',
    )
    expect(chunkPuts.length).toBeGreaterThanOrEqual(2)
    expect(chunkPuts[0]?.init?.headers).toMatchObject({
      'Content-Range': expect.stringContaining('bytes 0-'),
    })
  })
})

describe('sharePointStorage.getDownloadUrl', () => {
  it('reads @microsoft.graph.downloadUrl', async () => {
    const url = await sharePointStorage.getDownloadUrl('a/b/x.pdf')
    expect(url).toBe('https://dl.example/file')
  })
})

describe('sharePointStorage.delete', () => {
  it('issues a DELETE to the drive item', async () => {
    await sharePointStorage.delete('a/b/x.pdf')
    const del = calls.find((c) => (c.init?.method ?? '') === 'DELETE')
    expect(del?.url).toContain('/drives/drive-1/root:/a/b/x.pdf')
  })
})

describe('identity & least privilege', () => {
  it('requests a client-credentials token with the .default scope', async () => {
    await sharePointStorage.delete('a/b/x.pdf')
    const token = calls.find((c) => c.url.includes('/oauth2/v2.0/token'))
    expect(token).toBeDefined()
    expect(String(token?.init?.body)).toContain(
      'scope=https%3A%2F%2Fgraph.microsoft.com%2F.default',
    )
    expect(String(token?.init?.body)).toContain('grant_type=client_credentials')
  })

  it('reuses the cached token across calls (no second token request)', async () => {
    await sharePointStorage.delete('a/b/x.pdf')
    await sharePointStorage.delete('a/b/y.pdf')
    const tokenCalls = calls.filter((c) => c.url.includes('/oauth2/v2.0/token'))
    expect(tokenCalls).toHaveLength(1)
  })

  it('never requests Files.ReadWrite.All', async () => {
    await sharePointStorage.upload(
      'a/b/x.pdf',
      new Uint8Array([1]),
      'application/pdf',
    )
    await sharePointStorage.getDownloadUrl('a/b/x.pdf')
    for (const c of calls) {
      expect(c.url).not.toContain('Files.ReadWrite.All')
      expect(String(c.init?.body ?? '')).not.toContain('Files.ReadWrite.All')
    }
  })
})
