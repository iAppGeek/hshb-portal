import { headers } from 'next/headers'

// headers() is async in this Next.js version — see
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/headers.md
export async function getClientIp(): Promise<string | null> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim() || null
  return h.get('x-real-ip')
}
